# Media File Upload System

A cross-platform media file upload solution with a React web frontend, React Native (Expo) mobile app, and a Symfony 6.4 backend API. Uploads are chunked at 1 MB, support pause/resume/cancel, run up to 3 parallel chunk transfers per file and 3 concurrent file uploads, with automatic exponential-backoff retry on failure.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Symfony 6.4 (PHP 8.2) |
| Database | MySQL 8.0 |
| Cache | Redis |
| Web frontend | React 19 + TypeScript (Vite) |
| Mobile | React Native (Expo SDK 56) |
| Dev environment | Docker + Docker Compose |

## Project Structure

```
/
├── backend/          # Symfony 6.4 API
├── web/              # React + TypeScript frontend
├── mobile/           # React Native (Expo) app
├── docker/
│   ├── nginx/        # Nginx configuration
│   └── php/          # PHP-FPM Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | Latest | Required for backend + database |
| Node.js | 18+ | Required for web and mobile |
| Java JDK | 17 | Android builds only — see mobile setup |
| Android Studio | Latest | Android emulator + SDK |
| Xcode | 15+ | iOS simulator (macOS only) |

---

## 1. Backend (Symfony API)

### Start the Docker environment

```bash
docker compose up -d
```

### Install PHP dependencies (first run only)

```bash
docker compose exec php composer install
```

### Run database migrations (first run only)

```bash
docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
```

### Services

| Service | URL |
|---|---|
| Backend API | http://localhost:8080 |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |

### Run backend tests

```bash
docker compose exec php php bin/phpunit
```

---

## 2. Web Frontend (React + Vite)

```bash
cd web
npm install
npm run dev
```

The app runs at **http://localhost:5173** and expects the backend at `http://localhost:8080`. See [`web/README.md`](web/README.md) for full details.

---

## 3. Mobile App (React Native / Expo)

The mobile app requires a **development build** — it uses native modules (`expo-notifications`, `expo-background-task`, `expo-camera`) that are not available in the standard Expo Go client.

See [`mobile/README.md`](mobile/README.md) for the full setup guide, including first-time build instructions for Android and iOS.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload/initiate` | Start a new upload session |
| `POST` | `/api/upload/chunk` | Upload a single chunk (multipart) |
| `POST` | `/api/upload/finalize` | Reassemble chunks into final file |
| `POST` | `/api/upload/cancel/{id}` | Cancel an upload session |
| `GET` | `/api/upload/status/{id}` | Query upload session status |
| `DELETE` | `/api/upload/{id}` | Delete an upload and its chunks |

---

## Security & Storage

### Rate limiting

Rate limiting is applied only to `POST /api/upload/initiate` — the endpoint that creates a new upload session. Chunk uploads, finalization, and status queries are unrestricted.

This is an intentional design decision: limiting every chunk upload would prevent legitimate large file transfers from completing (a 23 MB file at 1 MB chunks requires 23 requests). The abuse vector is session spam, not chunk volume, so the limit sits at session creation.

| Endpoint | Limit |
|---|---|
| `POST /api/upload/initiate` | 10 requests / minute per IP |
| All other `/api/upload/*` endpoints | No limit |

Exceeded requests receive a `429` response with a `Retry-After` header.

### File type validation

The initiate endpoint rejects MIME types that are not images or video (`415 Unsupported Media Type`). After assembly, the finalize step re-validates the file against its binary magic numbers — a mismatch (e.g. a renamed executable) causes the assembled file to be discarded and the request to fail.

### File deduplication

An MD5 checksum is computed on the assembled file at finalize time. If an identical file has already been stored, the new copy is discarded and the session is linked to the existing path. This prevents duplicate storage without affecting the upload API surface.

### Storage layout

Completed files are written to `completed/YYYY/MM/DD/` under the storage root.

### Maintenance commands

| Command | Purpose |
|---|---|
| `app:cleanup-uploads` | Removes incomplete sessions idle for more than 30 minutes and deletes their temporary chunks |
| `app:purge-uploads` | Deletes completed files older than 30 days; respects shared paths created by deduplication |

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐
│  Web (React) │     │Mobile (Expo) │
│  port 5173   │     │  dev build   │
└──────┬───────┘     └──────┬───────┘
       │                    │
       └─────────┬──────────┘
                 │ HTTP (chunked multipart)
        ┌────────▼────────┐
        │  Nginx (8080)   │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  Symfony API    │
        │  (PHP-FPM)      │
        └────┬───────┬────┘
             │       │
      ┌──────▼──┐ ┌──▼──────┐
      │  MySQL  │ │  Redis  │
      └─────────┘ └─────────┘
```

Each file is split into fixed 1 MB chunks on the client. Chunks are uploaded in parallel (max 3 per file) and the server reassembles them once all chunks are received. Upload sessions survive client restarts — the client queries session status on resume and skips already-uploaded chunks.
