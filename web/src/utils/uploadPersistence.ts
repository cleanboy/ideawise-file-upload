import type { UploadItem } from '../types/uploads'
import type { UploadSession } from '../api/uploads'

// Persistence strategy: localStorage only stores session metadata (uploadId, progress,
// chunk list). The browser File object cannot be serialized — localStorage accepts
// strings only — so it is not persisted. On restore, items are shown in a paused state
// with needsFile: true, prompting the user to re-select the original file.
//
// Two alternatives were evaluated:
//
//   IndexedDB with raw File storage — IndexedDB can hold Blob/File objects directly,
//   which would eliminate re-selection. Rejected: it duplicates the file binary in
//   browser storage. For files up to the 2 GB limit this is routinely impractical;
//   browser storage quotas (typically 60% of available disk) would frequently block
//   large media files.
//
//   File System Access API (FileSystemFileHandle in IndexedDB) — a serializable handle
//   to a file on disk, no content duplication. Rejected: Firefox does not support this
//   API. Requiring Chromium or Safari for a core upload feature is not acceptable.
//
// The mobile app does not have this limitation because React Native accesses files by
// path, so sessions resume from the original path without re-selection.

const STORAGE_KEY = 'ideawise:uploads'
const TERMINAL = new Set(['completed', 'cancelled', 'rejected'])

type PersistedUpload = {
  id: string
  session: UploadSession
}

export function loadPersistedUploads(): UploadItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const stored = JSON.parse(raw) as unknown
    if (!Array.isArray(stored)) return []

    return (stored as PersistedUpload[]).map((entry) => ({
      id: entry.id,
      file: new File([], entry.session.filename, { type: entry.session.mimeType }),
      status: 'paused' as const,
      progress: entry.session.progress,
      uploadedChunks: entry.session.uploadedChunkCount,
      totalChunks: entry.session.totalChunks,
      session: entry.session,
      needsFile: true,
    }))
  } catch {
    return []
  }
}

export function persistUploads(uploads: UploadItem[]): void {
  const resumable = uploads.filter(
    (item) => item.session?.uploadId && !TERMINAL.has(item.status),
  )

  try {
    if (resumable.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    const stored: PersistedUpload[] = resumable.map((item) => ({
      id: item.id,
      session: item.session!,
    }))

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Ignore QuotaExceededError or other storage failures.
  }
}
