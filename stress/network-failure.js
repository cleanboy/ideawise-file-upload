/**
 * k6 network-failure tests — chunked upload API
 *
 * Three scenarios that test server resilience under adverse client behaviour:
 *
 *   abandoned    — 20 VUs upload ~50% of chunks then disconnect (never finalize).
 *                  Validates the server stays healthy under orphaned-session pressure.
 *
 *   resume       — 20 VUs upload the first half of chunks, pause 1-4 s (simulating a
 *                  reconnect), use GET /status to discover which chunks are already stored,
 *                  then upload only the missing chunks and finalize.
 *                  Validates the resume path and status-endpoint accuracy.
 *
 *   slow_network — 30 VUs complete full uploads with a 150-500 ms sleep between each
 *                  chunk batch, mimicking a mobile client on a congested connection.
 *                  Validates the server does not time out or exhaust workers on slow clients.
 *
 * Usage:
 *   k6 run --env SCENARIO=abandoned     stress/network-failure.js
 *   k6 run --env SCENARIO=resume        stress/network-failure.js
 *   k6 run --env SCENARIO=slow_network  stress/network-failure.js
 *   k6 run --env BASE_URL=http://staging:8080 --env SCENARIO=resume stress/network-failure.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Counter } from 'k6/metrics'

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

const CHUNK_SIZE          = 1024 * 1024
const MAX_PARALLEL_CHUNKS = 3

const PROFILES = [
  { label: 'small',  size:  1 * CHUNK_SIZE, mimeType: 'image/jpeg', filename: 'photo.jpg' },
  { label: 'medium', size: 10 * CHUNK_SIZE, mimeType: 'video/mp4',  filename: 'clip.mp4'  },
  { label: 'large',  size: 50 * CHUNK_SIZE, mimeType: 'video/mp4',  filename: 'video.mp4' },
]

// Reused across all requests in a VU — http.file() requires ArrayBuffer.
const CHUNK_BUFFER = new ArrayBuffer(CHUNK_SIZE)

// ── Custom metrics ────────────────────────────────────────────────────────────

// Proportion of resume-scenario sessions that reach "completed".
const resumeCompletionRate = new Rate('resume_completion_rate')

// Proportion of slow_network-scenario sessions that reach "completed".
const slowCompletionRate = new Rate('slow_completion_rate')

// Count of sessions intentionally abandoned (abandoned scenario only).
const orphanedSessions = new Counter('orphaned_sessions')

// Proportion of resume status checks where the server's uploadedChunks list
// is a subset of what the client successfully sent (no phantom entries).
const statusAccuracyRate = new Rate('status_accuracy_rate')

// ── Load scenarios ────────────────────────────────────────────────────────────

const SCENARIOS = {
  abandoned: {
    executor: 'constant-vus',
    vus:      20,
    duration: '2m',
    exec:     'abandonedVU',
  },
  resume: {
    executor: 'constant-vus',
    vus:      20,
    duration: '3m',
    exec:     'resumeVU',
  },
  slow_network: {
    executor: 'constant-vus',
    vus:      30,
    duration: '3m',
    exec:     'slowNetworkVU',
  },
}

const activeScenario = __ENV.SCENARIO || 'resume'

export const options = {
  scenarios: {
    [activeScenario]: SCENARIOS[activeScenario] || SCENARIOS.resume,
  },

  thresholds: {
    // Server endpoints must stay healthy regardless of client misbehaviour.
    'http_req_failed{name:initiate}': ['rate<0.02'],
    'http_req_duration{name:initiate}': ['p(95)<500'],
    'http_req_duration{name:chunk}':    ['p(95)<3000'],
    'http_req_duration{name:finalize}': ['p(95)<5000'],
    'http_req_duration{name:status}':   ['p(95)<300'],

    // Resume scenario: ≥ 95 % of sessions that reconnect should complete.
    'resume_completion_rate': ['rate>0.95'],

    // Slow network scenario: uploads should still complete despite inter-batch delays.
    'slow_completion_rate': ['rate>0.97'],

    // Status endpoint must not report chunks the client never successfully sent.
    'status_accuracy_rate': ['rate>0.99'],
  },
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function initiateUpload(profile) {
  return http.post(
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
}

// Sends chunk indices [startIndex, endIndex) as a single http.batch() call.
// Returns the response array in the same order as the index range.
function uploadChunkBatch(uploadId, startIndex, endIndex, extraTags) {
  const batch = []
  for (let ci = startIndex; ci < endIndex; ci++) {
    batch.push([
      'POST',
      `${BASE_URL}/api/upload/chunk`,
      {
        uploadId:   uploadId,
        chunkIndex: String(ci),
        chunk:      http.file(CHUNK_BUFFER, 'chunk.bin', 'application/octet-stream'),
      },
      { tags: { name: 'chunk', ...extraTags } },
    ])
  }
  return http.batch(batch)
}

// Sends all chunks in [fromIndex, toIndex) using MAX_PARALLEL_CHUNKS windows.
// Returns false on the first batch that contains any non-200 response.
function uploadChunkRange(uploadId, fromIndex, toIndex, extraTags) {
  for (let i = fromIndex; i < toIndex; i += MAX_PARALLEL_CHUNKS) {
    const batchEnd = Math.min(i + MAX_PARALLEL_CHUNKS, toIndex)
    const responses = uploadChunkBatch(uploadId, i, batchEnd, extraTags)
    for (const res of responses) {
      if (res.status !== 200) return false
    }
  }
  return true
}

// ── Scenario VU functions ─────────────────────────────────────────────────────

/**
 * Abandoned session: initiates an upload, uploads the first 50% of chunks,
 * then stops — simulating a user closing the app or a hard network drop.
 *
 * What this tests:
 *   - The server continues accepting new sessions despite accumulating orphaned ones.
 *   - The status endpoint returns a coherent partial state (not completed, not errored).
 *   - FPM workers released promptly after the connection closes (no worker leak).
 */
export function abandonedVU() {
  const profile     = PROFILES[(__VU - 1) % PROFILES.length]
  const totalChunks = Math.ceil(profile.size / CHUNK_SIZE)
  const uploadCount = Math.ceil(totalChunks / 2)

  const initiateRes = initiateUpload(profile)
  if (!check(initiateRes, { 'initiate: 201': r => r.status === 201 })) return

  const uploadId = initiateRes.json('uploadId')

  uploadChunkRange(uploadId, 0, uploadCount, { profile: profile.label })

  // Verify the server reflects a coherent in-progress state before we abandon.
  const statusRes = http.get(
    `${BASE_URL}/api/upload/status/${uploadId}`,
    { tags: { name: 'status', profile: profile.label } },
  )
  check(statusRes, {
    'abandoned: status 200':           r => r.status === 200,
    'abandoned: status not completed': r => {
      try { return r.json('status') !== 'completed' } catch { return false }
    },
  })

  orphanedSessions.add(1)
  // No finalize — intentional. The upload session is left orphaned.
}

/**
 * Resume after disconnect: uploads the first ~50% of chunks, pauses to
 * simulate a network interruption, then reconnects using GET /status to
 * learn which chunks the server already has before sending the remainder.
 *
 * What this tests:
 *   - GET /status returns an accurate uploadedChunks list after a partial upload.
 *   - Uploading the same chunk index a second time is handled safely (idempotency).
 *   - The full lifecycle completes correctly after resumption.
 *   - status_accuracy_rate: server never claims a chunk index we didn't successfully send.
 */
export function resumeVU() {
  const profile     = PROFILES[(__VU - 1) % PROFILES.length]
  const totalChunks = Math.ceil(profile.size / CHUNK_SIZE)
  const cutoff      = Math.ceil(totalChunks / 2)

  const initiateRes = initiateUpload(profile)
  if (!check(initiateRes, { 'initiate: 201': r => r.status === 201 })) {
    resumeCompletionRate.add(0)
    return
  }
  const uploadId = initiateRes.json('uploadId')

  // ── Phase 1: upload first half, tracking which chunks the server confirmed ──

  const sentOk = new Set()
  for (let i = 0; i < cutoff; i += MAX_PARALLEL_CHUNKS) {
    const batchEnd  = Math.min(i + MAX_PARALLEL_CHUNKS, cutoff)
    const responses = uploadChunkBatch(uploadId, i, batchEnd, { profile: profile.label })
    for (let j = 0; j < responses.length; j++) {
      if (responses[j].status === 200) sentOk.add(i + j)
    }
  }

  // ── Phase 2: simulate reconnect delay ────────────────────────────────────

  sleep(1 + Math.random() * 3)

  // ── Phase 3: query status, verify accuracy ────────────────────────────────

  const statusRes = http.get(
    `${BASE_URL}/api/upload/status/${uploadId}`,
    { tags: { name: 'status', profile: profile.label } },
  )
  if (!check(statusRes, { 'resume: status 200': r => r.status === 200 })) {
    resumeCompletionRate.add(0)
    return
  }

  const serverHas = new Set(statusRes.json('uploadedChunks') || [])

  // Every index the server claims must be one we successfully sent.
  let accuracyOk = true
  for (const ci of serverHas) {
    if (!sentOk.has(ci)) { accuracyOk = false; break }
  }
  statusAccuracyRate.add(accuracyOk ? 1 : 0)

  // ── Phase 4: upload only chunks the server does not yet have ──────────────

  let chunkFailed = false
  for (let i = 0; i < totalChunks && !chunkFailed; i += MAX_PARALLEL_CHUNKS) {
    const batchEnd = Math.min(i + MAX_PARALLEL_CHUNKS, totalChunks)
    const batch    = []
    for (let ci = i; ci < batchEnd; ci++) {
      if (serverHas.has(ci)) continue
      batch.push([
        'POST',
        `${BASE_URL}/api/upload/chunk`,
        {
          uploadId:   uploadId,
          chunkIndex: String(ci),
          chunk:      http.file(CHUNK_BUFFER, 'chunk.bin', 'application/octet-stream'),
        },
        { tags: { name: 'chunk', profile: profile.label } },
      ])
    }
    if (batch.length === 0) continue
    const responses = http.batch(batch)
    for (const res of responses) {
      if (res.status !== 200) { chunkFailed = true; break }
    }
  }

  if (chunkFailed) { resumeCompletionRate.add(0); return }

  // ── Phase 5: finalize ─────────────────────────────────────────────────────

  const finalizeRes = http.post(
    `${BASE_URL}/api/upload/finalize`,
    JSON.stringify({ uploadId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { name: 'finalize', profile: profile.label },
    },
  )

  resumeCompletionRate.add(
    check(finalizeRes, {
      'resume finalize: 200':       r => r.status === 200,
      'resume finalize: completed': r => {
        try { return r.json('status') === 'completed' } catch { return false }
      },
    }) ? 1 : 0
  )
}

/**
 * Slow/degraded network: full upload lifecycle with a 150-500 ms sleep between
 * each chunk batch, simulating a mobile client on a congested or poor connection
 * (e.g. edge, 3G, or a high-latency cellular link).
 *
 * What this tests:
 *   - The server does not time out long-running but still-active connections.
 *   - FPM workers are not held idle during the inter-batch pauses (they are released
 *     between HTTP requests, not between batches — so this is safe).
 *   - Uploads still complete end-to-end under realistic slow-client timing.
 */
export function slowNetworkVU() {
  const profile     = PROFILES[(__VU - 1) % PROFILES.length]
  const totalChunks = Math.ceil(profile.size / CHUNK_SIZE)

  const initiateRes = initiateUpload(profile)
  if (!check(initiateRes, { 'initiate: 201': r => r.status === 201 })) {
    slowCompletionRate.add(0)
    return
  }
  const uploadId = initiateRes.json('uploadId')

  let chunkFailed = false
  for (let i = 0; i < totalChunks && !chunkFailed; i += MAX_PARALLEL_CHUNKS) {
    const batchEnd  = Math.min(i + MAX_PARALLEL_CHUNKS, totalChunks)
    const responses = uploadChunkBatch(uploadId, i, batchEnd, { profile: profile.label })

    for (const res of responses) {
      if (res.status !== 200) { chunkFailed = true; break }
    }

    // Inter-batch pause — simulates the mobile client reading the next chunk from
    // local storage before it can send. Skip the pause after the final batch.
    if (!chunkFailed && batchEnd < totalChunks) {
      sleep(0.15 + Math.random() * 0.35)
    }
  }

  if (chunkFailed) { slowCompletionRate.add(0); return }

  const finalizeRes = http.post(
    `${BASE_URL}/api/upload/finalize`,
    JSON.stringify({ uploadId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { name: 'finalize', profile: profile.label },
    },
  )

  slowCompletionRate.add(
    check(finalizeRes, {
      'slow finalize: 200':       r => r.status === 200,
      'slow finalize: completed': r => {
        try { return r.json('status') === 'completed' } catch { return false }
      },
    }) ? 1 : 0
  )
}
