/**
 * k6 stress test — chunked upload API
 *
 * Usage:
 *   k6 run stress/upload.js                                 # ramp-to-100 (default)
 *   k6 run --env SCENARIO=baseline stress/upload.js         # 10 VUs, 2 min baseline
 *   k6 run --env SCENARIO=spike    stress/upload.js         # instant 100 VUs
 *   k6 run --env BASE_URL=http://staging:8080 stress/upload.js
 *   k6 run stress/upload.js --out json=results/run.json     # save raw metrics
 */

import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

// Both constants mirror the values in mobile/src/hooks/useUploads.ts so the
// test accurately reproduces the load pattern the mobile client generates.
const CHUNK_SIZE          = 1024 * 1024  // 1 MB
const MAX_PARALLEL_CHUNKS = 3

// ── File profiles ─────────────────────────────────────────────────────────────
// Cycled round-robin across VUs so all three sizes are present in every run.
//   small  → 1 chunk   (images, protocol overhead dominated)
//   medium → 10 chunks (typical short video, tests chunk parallelism)
//   large  → 50 chunks (long video, tests sustained I/O + finalize assembly)

const PROFILES = [
  { label: 'small',  size:  1 * CHUNK_SIZE, mimeType: 'image/jpeg', filename: 'photo.jpg'  },
  { label: 'medium', size: 10 * CHUNK_SIZE, mimeType: 'video/mp4',  filename: 'clip.mp4'   },
  { label: 'large',  size: 50 * CHUNK_SIZE, mimeType: 'video/mp4',  filename: 'video.mp4'  },
]

// 1 MB zero-filled ArrayBuffer allocated once per VU and reused for every chunk
// request in that VU. http.file() requires ArrayBuffer (not Uint8Array).
// The server does not validate chunk content — zeros are fine for load testing.
const CHUNK_BUFFER = new ArrayBuffer(CHUNK_SIZE)

// ── Custom metrics ────────────────────────────────────────────────────────────

// Tracks the proportion of initiated uploads that reach status "completed".
// Threshold: rate > 0.99 (see options below).
const uploadCompletionRate = new Rate('upload_completion_rate')

// Tracks the error rate specifically for POST /chunk requests, separately from
// the global http_req_failed rate so chunk failures stand out in the summary.
const chunkErrorRate = new Rate('chunk_error_rate')

// ── Load scenarios ─────────────────────────────────────────────────────────────

const SCENARIOS = {
  // Quick sanity check — verifies thresholds pass before scaling up.
  baseline: {
    executor: 'constant-vus',
    vus: 10,
    duration: '2m',
  },

  // Primary scenario for the ≥ 100 concurrent uploads requirement.
  // Gradual ramp gives the server time to reach steady state and lets the
  // latency degradation curve be read from the time-series output.
  ramp: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '2m',  target: 100 },
      { duration: '30s', target: 0   },
    ],
    // Allow in-flight uploads to complete cleanly during ramp-down so partial
    // uploads do not inflate the failure metrics.
    gracefulRampDown: '30s',
  },

  // Simulates all clients uploading simultaneously after a reconnect.
  // Exercises cold-start: FPM process spawning, MySQL connection establishment.
  spike: {
    executor: 'constant-vus',
    vus: 100,
    duration: '2m',
  },
}

export const options = {
  scenarios: {
    uploads: SCENARIOS[__ENV.SCENARIO] || SCENARIOS.ramp,
  },

  thresholds: {
    // Latency — tagged per endpoint via { name: '<endpoint>' } in each request.
    // Rationale for values: initiate/status are DB reads/writes; chunk includes
    // a 1 MB disk write + DB flush; finalize includes sequential chunk assembly.
    'http_req_duration{name:initiate}': ['p(95)<500'],
    'http_req_duration{name:chunk}':    ['p(95)<3000'],
    'http_req_duration{name:finalize}': ['p(95)<5000'],
    'http_req_duration{name:status}':   ['p(95)<300'],

    // Error rates
    'http_req_failed':             ['rate<0.01'],   // overall: < 1 %
    'http_req_failed{name:chunk}': ['rate<0.005'],  // chunks specifically: < 0.5 %

    // Upload lifecycle
    'upload_completion_rate': ['rate>0.99'],  // ≥ 99 % of sessions reach "completed"
    'chunk_error_rate':       ['rate<0.005'],
  },
}

// ── Main VU function ──────────────────────────────────────────────────────────

export default function () {
  // Distribute profiles evenly: VU 1 → small, VU 2 → medium, VU 3 → large, repeat.
  const profile     = PROFILES[(__VU - 1) % PROFILES.length]
  const totalChunks = Math.ceil(profile.size / CHUNK_SIZE)

  // ── Step 1: Initiate ────────────────────────────────────────────────────────

  const initiateRes = http.post(
    `${BASE_URL}/api/upload/initiate`,
    JSON.stringify({
      filename:  profile.filename,
      mimeType:  profile.mimeType,
      fileSize:  profile.size,
      chunkSize: CHUNK_SIZE,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { name: 'initiate', profile: profile.label },
    },
  )

  const initiateOk = check(initiateRes, {
    'initiate: status 201': (r) => r.status === 201,
    'initiate: uploadId present': (r) => {
      try { return typeof r.json('uploadId') === 'string' } catch { return false }
    },
  })

  if (!initiateOk) {
    uploadCompletionRate.add(0)
    return
  }

  const uploadId = initiateRes.json('uploadId')

  // ── Step 2: Upload chunks ───────────────────────────────────────────────────
  // Mirrors the mobile client: send up to MAX_PARALLEL_CHUNKS requests at once
  // using http.batch(), then move to the next window. This produces the same
  // burst-of-3-concurrent-chunk-writes pattern the server sees in production.

  let chunkFailed = false

  for (let i = 0; i < totalChunks && !chunkFailed; i += MAX_PARALLEL_CHUNKS) {
    const batchEnd = Math.min(i + MAX_PARALLEL_CHUNKS, totalChunks)
    const batch = []

    for (let ci = i; ci < batchEnd; ci++) {
      batch.push([
        'POST',
        `${BASE_URL}/api/upload/chunk`,
        {
          uploadId:   uploadId,
          chunkIndex: String(ci),
          // http.file() wraps the buffer in a FileData object; k6 sets
          // Content-Type: multipart/form-data automatically.
          chunk: http.file(CHUNK_BUFFER, 'chunk.bin', 'application/octet-stream'),
        },
        { tags: { name: 'chunk', profile: profile.label } },
      ])
    }

    const responses = http.batch(batch)

    for (const res of responses) {
      const ok = check(res, { 'chunk: status 200': (r) => r.status === 200 })
      chunkErrorRate.add(ok ? 0 : 1)
      if (!ok) chunkFailed = true
    }
  }

  if (chunkFailed) {
    uploadCompletionRate.add(0)
    return
  }

  // ── Step 3: Finalize ────────────────────────────────────────────────────────
  // The server assembles all chunk files sequentially (stream_copy_to_stream)
  // then writes the completed row to MySQL. This is the step most sensitive to
  // concurrent disk I/O — 100 VUs finalizing simultaneously = 100 assembly ops.

  const finalizeRes = http.post(
    `${BASE_URL}/api/upload/finalize`,
    JSON.stringify({ uploadId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { name: 'finalize', profile: profile.label },
    },
  )

  const finalizeOk = check(finalizeRes, {
    'finalize: status 200':        (r) => r.status === 200,
    'finalize: status "completed"': (r) => {
      try { return r.json('status') === 'completed' } catch { return false }
    },
  })

  uploadCompletionRate.add(finalizeOk ? 1 : 0)
}
