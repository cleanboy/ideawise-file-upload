# Stress Testing Plan — Chunked Upload API

## 1. Objective

Verify that the upload API sustains **≥ 100 concurrent upload sessions** without exceeding the latency
and error-rate thresholds defined in §6. The test surfaces the system's practical ceiling and
identifies which layer (PHP-FPM, MySQL, disk I/O, or Nginx) saturates first.

---

## 2. System Under Test

```
Client (k6 VUs)
      │  HTTP
      ▼
  Nginx :8080          ← connection limits, worker_connections
      │
      ▼
  PHP-FPM              ← pm.max_children process pool
      │
      ├──► MySQL :3306  ← connection pool, per-chunk flush, JSON column update
      │
      └──► Local disk   ← chunk writes (chunks/<id>/<n>.part), assembly on finalize
```

**Stack:** Symfony 6 · PHP-FPM · Nginx · MySQL 8 · Docker Compose

**Endpoints under test:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload/initiate` | Creates `UploadSession` row, returns session JSON |
| POST | `/api/upload/chunk` | Multipart form; stores chunk to disk, updates DB |
| POST | `/api/upload/finalize` | Assembles chunks sequentially, marks `completed` |
| GET | `/api/upload/status/{id}` | Reads session state (resume path) |
| POST | `/api/upload/cancel/{id}` | Cancels session, removes chunk files |

**Client upload parameters (from `useUploads.ts`):**

| Constant | Value |
|---|---|
| `CHUNK_SIZE` | 1 MB |
| `MAX_PARALLEL_CHUNKS` | 3 per upload |
| `MAX_CONCURRENT_UPLOADS` | 3 per mobile client (not relevant at API level) |
| `MAX_CHUNK_RETRIES` | 3 with exponential back-off (500 ms × 2^n) |

---

## 3. Tool

**[k6](https://k6.io/) (Grafana)** — TypeScript/JS scenarios, built-in virtual users,
structured metrics output, CI-friendly. Runs as a single binary with no server infrastructure.

Install: `brew install k6` or `docker pull grafana/k6`.

---

## 4. Scenarios

Three load profiles, each building on the last.

### 4.1 Baseline — 10 VUs for 2 minutes

Establishes per-endpoint latency and error-rate baselines under low concurrency.
All thresholds must pass here before running higher-load scenarios.

### 4.2 Ramp-to-100 — gradual scale-up

```
VUs:  0 ──── 30s ────► 100 ──── 2 min ────► 100 ──── 30s ────► 0
```

Gives the server time to reach steady state. This is the primary scenario for the ≥ 100
concurrent uploads requirement. Captures latency degradation curve as concurrency rises
and reveals whether the system stabilises or continues to degrade at peak.

### 4.3 Spike — instant 100 VUs

```
VUs:  0 ──── 0s ──────► 100 ──── 2 min ────► 0
```

Simulates a sudden burst (e.g. app users all pressing Upload at the same time after a
network reconnect). Tests cold-start behaviour: PHP-FPM process spawning, MySQL connection
establishment, and whether queued requests time out before workers become available.

### 4.4 Abandoned Upload — 20 VUs for 2 minutes

Each VU initiates an upload, sends the first 50% of chunks, then stops without calling
finalize — simulating a user closing the app or a hard network drop mid-upload. The
session is never cleaned up within the test window.

**What this exposes:** Whether the server accumulates orphaned sessions gracefully. If
FPM workers are held by long-running requests or database rows accumulate without
consequence, 20 concurrent abandonments over 2 minutes will surface it. The `/status`
endpoint is checked after the partial upload to confirm the server returns a coherent
in-progress state.

### 4.5 Resume — 20 VUs for 3 minutes

Each VU uploads the first ~50 % of chunks, pauses 1–4 seconds (simulating a reconnect
delay), calls `GET /api/upload/status/{id}` to retrieve the server's confirmed
`uploadedChunks` list, then uploads only the missing chunks and finalizes.

**What this exposes:** Whether the `/status` endpoint returns an accurate chunk list
after a partial upload (the `status_accuracy_rate` metric catches phantom entries).
Also exercises the idempotency of re-uploading a chunk index that the server may
have partially recorded before the disconnect.

### 4.6 Slow / degraded network — 30 VUs for 3 minutes

Each VU completes the full upload lifecycle but sleeps 150–500 ms between each chunk
batch, mimicking a mobile client on a congested 3G or high-latency cellular link.

**What this exposes:** Whether the server times out still-active connections and whether
FPM workers are held idle during the inter-batch pauses. Because each HTTP request
completes before the sleep begins, FPM workers are released between requests — this
scenario confirms the server's keepalive and timeout settings do not penalise slow
clients that do continue making progress.

---

## 5. Virtual User Behaviour

Each VU runs the full upload lifecycle once per iteration, mimicking a single mobile client
uploading one file.

```
┌─────────────────────────────────────────────────────┐
│  VU iteration                                       │
│                                                     │
│  1. POST /api/upload/initiate                       │
│     body: { filename, mimeType, fileSize, chunkSize }│
│     → save uploadId from response                   │
│                                                     │
│  2. For each chunk (parallel, up to 3 at once):     │
│     POST /api/upload/chunk                          │
│     multipart: { uploadId, chunkIndex, chunk: blob }│
│                                                     │
│  3. POST /api/upload/finalize                       │
│     body: { uploadId }                              │
│     → assert status === "completed"                 │
│                                                     │
│  4. (Error path) On any non-2xx:                    │
│     record error tag, do NOT retry — let k6         │
│     thresholds catch the error rate                 │
└─────────────────────────────────────────────────────┘
```

**Test data:** k6 generates a synthetic binary payload in-process using `crypto.getRandomValues`.
No real files are needed. Three file sizes are cycled across VUs to exercise different chunk counts:

| Profile | File size | Chunks | Disk write per upload |
|---------|-----------|--------|----------------------|
| Small | 1 MB | 1 | 1 MB |
| Medium | 10 MB | 10 | 10 MB |
| Large | 50 MB | 50 | 50 MB |

At 100 VUs with medium files, peak concurrent disk writes ≈ 100 × 3 parallel chunks × 1 MB ≈ **300 MB
in flight at any moment**.

---

## 6. Metrics and Thresholds

k6 exports these automatically; thresholds fail the test run if breached.

### Latency (p95, measured separately per endpoint via tags)

| Endpoint | p95 threshold |
|----------|---------------|
| `POST /initiate` | < 500 ms |
| `POST /chunk` (1 MB payload) | < 3 s |
| `POST /finalize` | < 5 s |
| `GET /status` | < 300 ms |

Rationale: chunk upload p95 includes disk write + DB flush; finalize includes sequential
`stream_copy_to_stream` assembly for all chunks before the DB write.

### Error rates

| Metric | Threshold |
|--------|-----------|
| Overall HTTP error rate | < 1 % |
| `POST /chunk` error rate | < 0.5 % |
| Upload completion rate | ≥ 99 % (initiated sessions that reach `completed`) |

### Throughput (informational, not a hard threshold)

Report MB/s of chunk data accepted at peak VU count. This anchors future capacity planning.

---

## 7. Known Bottlenecks and What the Test Exposes

Each of these will manifest as a distinct latency or error signature.

### 7.1 PHP-FPM process pool exhaustion

**Risk:** `pm.max_children` defaults to a low value in the Docker image. At 100 concurrent
chunk requests (each holding a worker while writing to disk), new requests queue at Nginx
and eventually time out with 502/504.

**Signature:** Rising p99 on `/chunk`, 502 errors visible in k6 error tags, Nginx
`upstream timed out` in logs.

**Remediation:** Increase `pm.max_children` (or switch to `pm = ondemand`) in
`docker/php/php-fpm.d/*.conf`. A sensible starting point is 2× expected concurrent requests.

### 7.2 MySQL connection pool and per-chunk flushes

**Risk:** Every `POST /chunk` call ends with `EntityManager::flush()` — a synchronous DB
write. The `uploadedChunks` JSON column is re-serialised on each chunk. At 300 concurrent
chunk requests, this creates ≥ 300 near-simultaneous DB writes, likely saturating MySQL's
default `max_connections = 151`.

**Signature:** Doctrine `PDOException: SQLSTATE[HY000]: General error: 1040 Too many
connections` errors in PHP logs; rising latency on all endpoints.

**Remediation:**
- Raise MySQL `max_connections` to match FPM pool size.
- Consider batching chunk-state writes (write to disk, confirm immediately, reconcile with
  `syncStoredChunks` lazily) to reduce flush frequency.
- A connection pooler (ProxySQL, PgBouncer equivalent) would let FPM workers share a
  smaller connection pool without blocking.

### 7.3 Disk I/O saturation during finalize

**Risk:** `UploadStorage::assemble()` is a sequential `stream_copy_to_stream` loop.
Under 100 concurrent finalize requests, 100 assembly operations run simultaneously,
each reading N chunk files and writing one output file. This creates a read-amplification
spike: 100 uploads × 50 chunks = 5 000 small file reads at once.

**Signature:** `POST /finalize` p95 exceeds threshold while `/chunk` p95 is healthy.
Disk I/O wait visible in `iostat` / `docker stats`.

**Remediation:** Rate-limit concurrent finalizations (a semaphore in the controller or a
background queue), or move storage to object storage (S3-compatible) where assembly is a
server-side multipart-complete operation.

### 7.4 Nginx connection and worker limits

**Risk:** Default `worker_connections 1024` is likely sufficient, but `keepalive_timeout`
interacts with FPM queue depth. k6's default connection reuse may mask upstream queuing.

**Signature:** `connect() failed (111: Connection refused)` in k6 output at spike start,
or `499 Client Closed Request` once the spike subsides and Nginx drains the queue.

**Remediation:** Check `docker/nginx/default.conf` for `worker_connections` and
`upstream` settings. Add `keepalive` on the upstream block.

### 7.5 macOS Docker Desktop cross-filesystem chunk move *(observed — dev environment only)*

**Risk:** PHP-FPM writes incoming multipart files to its temp directory (`/tmp/phpXXXXXX`),
which lives on the container's overlay filesystem. `UploadedFile::move()` then calls
`rename()` to move the file to `var/uploads/chunks/`, which lives on the VirtioFS volume
mount. On macOS Docker Desktop, these are two different filesystems — `rename()` returns
`EXDEV` and PHP falls back to a file copy. Under 30+ concurrent 1 MB copies through
Docker Desktop's virtualisation layer, the copy occasionally fails, causing
`UploadedFile::move()` to throw. The exception is caught by the controller's `Throwable`
catch block and returned as a `500 storage_error`, with no PHP log entry because the
exception is not re-thrown.

**Signature:** Intermittent HTTP 500 on `POST /chunk` (confirmed at ~1% rate during
baseline run). No MySQL or Nginx errors. PHP logs show only debug-level `ErrorListener`
events, not the underlying exception.

**Environment scope:** This failure mode is specific to Docker Desktop on macOS. On a
real Linux deployment (bare metal or cloud VM), `/tmp` and the app storage directory share
the same ext4 filesystem, so `rename()` succeeds atomically and this error cannot occur.

**Remediation for local dev (optional):** Set PHP's `upload_tmp_dir` to a path within
the volume mount (e.g. `/var/www/backend/var/tmp`) so both source and destination are on
the same VirtioFS filesystem, restoring `rename()` semantics. This requires creating the
directory at container startup (not in the Dockerfile, as the volume mount shadows build-time
`mkdir` calls).

---

### 7.6 `uploadedChunks` JSON column write amplification

**Risk:** The `replaceUploadedChunks` method re-sorts and re-serialises the entire
`uploadedChunks` JSON array on every chunk. For a 50-chunk upload this is a 50-element
array write per chunk — O(n²) writes over the upload lifetime. Under 100 concurrent
uploads, this is the dominant DB write pattern.

**Signature:** Increasing per-chunk DB latency as upload progresses (visible if k6 tags
chunk requests with file profile + chunk index).

**Remediation:** Replace the JSON array with a bitmask or a separate `upload_chunks`
table with one row per chunk, avoiding full array rewrite on each update.

### 7.7 Orphaned session disk accumulation

**Risk:** Abandoned uploads leave chunk files in `var/uploads/chunks/<id>/` indefinitely.
No expiry or cleanup job exists in the current implementation. Under sustained abandonment
load (e.g. the §4.4 scenario running repeatedly), disk usage grows without bound. On a
Docker volume this will not show up in `df` on the host — use `docker compose exec php du -sh var/uploads`
to measure.

**Signature:** Disk space exhaustion causes chunk writes to fail with `ENOSPC`. This
surfaces as HTTP 500 on `POST /chunk` for all sessions, not just abandoned ones.

**Remediation:** Add a scheduled cleanup command (`doctrine:query:dql` or a Symfony
console command) that deletes sessions in `uploading` state older than a configurable
TTL (e.g. 24 h) along with their chunk directories. The `cancel` endpoint already
performs this cleanup on demand — a cron-based sweep reuses the same storage service method.

---

## 8. Infrastructure Setup

Before running:

1. **Start the stack:** `docker compose up -d`
2. **Run migrations:** `docker compose exec php bin/console doctrine:migrations:migrate --no-interaction`
3. **Verify the API is reachable:** `curl -s http://localhost:8080/api/upload/status/nonexistent | jq .`
   (expect `404` with `not_found` code)
4. **Ensure sufficient storage:** Stress run with 100 VUs × 10 MB medium files ≈ **1 GB** of
   chunk data written during the test. The `/completed` directory grows by the same amount.
   Clean up between runs: `docker compose exec php find var/uploads -mindepth 1 -delete`
5. **Optional — expose metrics:** Add `--out json=results.json` to k6 to capture raw data.
   Import into Grafana k6 dashboard for time-series visualisation.

---

## 9. Execution

```bash
# Install k6 (once)
brew install k6

# ── Load scenarios (stress/upload.js) ─────────────────────────────────────────

# Run baseline (10 VUs, 2 min)
k6 run --env SCENARIO=baseline stress/upload.js

# Run ramp-to-100 (default — 0→100 VUs over 30 s, hold 2 min, ramp down)
k6 run stress/upload.js

# Run spike (instant 100 VUs)
k6 run --env SCENARIO=spike stress/upload.js

# ── Network failure scenarios (stress/network-failure.js) ─────────────────────

# Abandoned upload: 20 VUs initiate + partial-upload, then disconnect
k6 run --env SCENARIO=abandoned stress/network-failure.js

# Resume: 20 VUs disconnect mid-upload, reconnect via /status, then complete
k6 run --env SCENARIO=resume stress/network-failure.js

# Slow network: 30 VUs complete full uploads with 150-500 ms inter-batch delays
k6 run --env SCENARIO=slow_network stress/network-failure.js

# ── Output options ─────────────────────────────────────────────────────────────

# Save raw metrics for post-analysis or Grafana import
k6 run stress/upload.js --out json=results/ramp-$(date +%Y%m%dT%H%M).json
k6 run --env SCENARIO=resume stress/network-failure.js --out json=results/resume-$(date +%Y%m%dT%H%M).json
```

---

## 10. Pass / Fail Criteria

The stress test passes if **all three** of the following hold at 100 concurrent VUs (ramp-to-100
scenario, steady-state period only):

1. All latency thresholds in §6 are met.
2. Overall error rate < 1 %, chunk error rate < 0.5 %.
3. Upload completion rate ≥ 99 % (i.e. ≥ 99 of every 100 sessions initiated reach `completed`).

A threshold breach is a signal to profile the specific bottleneck (§7) before tuning and
re-running.

### Network failure scenarios (`stress/network-failure.js`)

These scenarios have separate pass/fail criteria because client behaviour is intentionally
abnormal:

| Scenario | Pass condition |
|----------|----------------|
| `abandoned` | No threshold on completion rate (abandonment is intentional). `http_req_failed{name:initiate}` < 2 %, `http_req_duration` thresholds all met — confirms server stays healthy under orphan pressure. |
| `resume` | `resume_completion_rate` ≥ 95 %. `status_accuracy_rate` ≥ 99 % (server never reports a chunk index the client did not successfully send). |
| `slow_network` | `slow_completion_rate` ≥ 97 %. All latency thresholds met — slow clients must not degrade latency for other sessions. |

**After running `abandoned`:** check `docker compose exec php du -sh var/uploads/chunks`
to confirm orphaned chunk directories are present and assess disk growth rate (see §7.7).
