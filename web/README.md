# Web Frontend

React 19 + TypeScript + Vite web client for the Media File Upload System.

## Setup

```bash
npm install
npm run dev
```

Runs at **http://localhost:5173**. The backend API must be running at `http://localhost:8080` (see the root README).

To point at a different API host, set the environment variable before starting:

```bash
VITE_API_BASE_URL=http://my-api-host npm run dev
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:e2e:ui` | Open the Playwright UI |

## Architecture

```
web/src/
├── api/
│   └── uploads.ts          # All HTTP calls to the backend
├── components/
│   ├── DropZone.tsx         # Drag-and-drop file picker
│   ├── HistoryModal.tsx     # Upload history dialog
│   ├── UploadList.tsx       # Renders the list of upload cards
│   └── UploadCard.tsx       # Individual file card with progress + actions
├── hooks/
│   ├── useUploads.ts        # Core upload state machine + chunked upload logic
│   ├── useUploadHistory.ts  # Persistent upload history (localStorage)
│   ├── useHistorySync.ts    # Moves completed/failed items into history
│   └── useSelection.ts      # Multi-select state for batch start
├── types/
│   └── uploads.ts           # Shared TypeScript types
└── utils/
    ├── formatBytes.ts        # Human-readable file sizes
    ├── formatDuration.ts     # Format seconds as m:ss
    └── uploadStatus.ts       # STARTABLE set + isTerminal helper
```

## Key Design Decisions

**Chunked upload flow:**
1. `initiateUpload` — registers the file with the server and gets back a session ID and total chunk count
2. Up to 3 chunks are uploaded in parallel using a worker pool
3. Each chunk is retried up to 3 times with exponential backoff on failure
4. `finalizeUpload` — tells the server all chunks are present and triggers reassembly

**Pause/resume:** pausing sets the upload status to `paused` and aborts new chunk workers. On resume, the client calls `getUploadStatus` to fetch which chunks the server already has, then only uploads the remaining ones.

**History:** terminal uploads (`completed`, `cancelled`, `failed`) are automatically moved to `localStorage`-backed history via `useHistorySync`, so they survive page refreshes.

## Features

- Drag-and-drop + click-to-browse file picker
- Accepts `image/*` and `video/*`, up to 2 GB per file, max 10 files per selection
- Chunked upload at 1 MB per chunk, 3 parallel chunks per file, 3 concurrent files
- Per-file progress bar + status badge
- Pause, resume, cancel, and retry per file
- Batch start selected files
- Upload history modal (persisted in localStorage)
- Responsive layout (desktop and tablet)
