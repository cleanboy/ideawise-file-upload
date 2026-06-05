import { describe, it, expect, beforeEach } from 'vitest'
import { loadPersistedUploads, persistUploads } from './uploadPersistence'
import type { UploadSession } from '../api/uploads'
import type { UploadItem } from '../types/uploads'

function makeSession(overrides?: Partial<UploadSession>): UploadSession {
  return {
    uploadId: 'upload-1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 512000,
    chunkSize: 1024 * 1024,
    totalChunks: 3,
    uploadedChunks: [0, 1],
    uploadedChunkCount: 2,
    progress: 66.7,
    status: 'uploading',
    createdAt: '2026-06-05T00:00:00Z',
    updatedAt: '2026-06-05T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

function makeItem(overrides?: Partial<UploadItem>): UploadItem {
  return {
    id: 'item-1',
    file: new File([''], 'photo.jpg', { type: 'image/jpeg' }),
    status: 'paused',
    progress: 66.7,
    uploadedChunks: 2,
    totalChunks: 3,
    session: makeSession(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

// ─── loadPersistedUploads ─────────────────────────────────────────────────────

describe('loadPersistedUploads', () => {
  it('returns an empty array when localStorage has no entry', () => {
    expect(loadPersistedUploads()).toEqual([])
  })

  it('returns an empty array when the stored value is not valid JSON', () => {
    localStorage.setItem('ideawise:uploads', 'not-json{{{')
    expect(loadPersistedUploads()).toEqual([])
  })

  it('returns an empty array when the stored value is not an array', () => {
    localStorage.setItem('ideawise:uploads', JSON.stringify({ id: '1' }))
    expect(loadPersistedUploads()).toEqual([])
  })

  it('restores items with needsFile true and status paused', () => {
    localStorage.setItem('ideawise:uploads', JSON.stringify([{ id: 'item-1', session: makeSession() }]))

    const [item] = loadPersistedUploads()

    expect(item.needsFile).toBe(true)
    expect(item.status).toBe('paused')
    expect(item.id).toBe('item-1')
  })

  it('reconstructs file name and MIME type from the session', () => {
    const session = makeSession({ filename: 'clip.mp4', mimeType: 'video/mp4' })
    localStorage.setItem('ideawise:uploads', JSON.stringify([{ id: 'item-1', session }]))

    const [item] = loadPersistedUploads()

    expect(item.file.name).toBe('clip.mp4')
    expect(item.file.type).toBe('video/mp4')
  })

  it('sets progress, uploadedChunks, and totalChunks from the session', () => {
    const session = makeSession({ progress: 66.7, uploadedChunkCount: 2, totalChunks: 3 })
    localStorage.setItem('ideawise:uploads', JSON.stringify([{ id: 'item-1', session }]))

    const [item] = loadPersistedUploads()

    expect(item.progress).toBe(66.7)
    expect(item.uploadedChunks).toBe(2)
    expect(item.totalChunks).toBe(3)
  })

  it('attaches the full session object to each restored item', () => {
    const session = makeSession()
    localStorage.setItem('ideawise:uploads', JSON.stringify([{ id: 'item-1', session }]))

    const [item] = loadPersistedUploads()

    expect(item.session).toEqual(session)
  })

  it('restores multiple items in order', () => {
    const entries = [
      { id: 'a', session: makeSession({ uploadId: 'u-a', filename: 'a.jpg' }) },
      { id: 'b', session: makeSession({ uploadId: 'u-b', filename: 'b.jpg' }) },
    ]
    localStorage.setItem('ideawise:uploads', JSON.stringify(entries))

    const items = loadPersistedUploads()

    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('a')
    expect(items[1].id).toBe('b')
  })
})

// ─── persistUploads ───────────────────────────────────────────────────────────

describe('persistUploads', () => {
  it('saves items that have a session and are not in a terminal status', () => {
    persistUploads([makeItem({ status: 'paused' })])

    const stored = JSON.parse(localStorage.getItem('ideawise:uploads')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('item-1')
  })

  it('saves uploading items', () => {
    persistUploads([makeItem({ status: 'uploading' })])
    expect(JSON.parse(localStorage.getItem('ideawise:uploads')!)).toHaveLength(1)
  })

  it('saves failed items', () => {
    persistUploads([makeItem({ status: 'failed', error: 'Network error' })])
    expect(JSON.parse(localStorage.getItem('ideawise:uploads')!)).toHaveLength(1)
  })

  it('does not save completed items', () => {
    persistUploads([makeItem({ status: 'completed' })])
    expect(localStorage.getItem('ideawise:uploads')).toBeNull()
  })

  it('does not save cancelled items', () => {
    persistUploads([makeItem({ status: 'cancelled' })])
    expect(localStorage.getItem('ideawise:uploads')).toBeNull()
  })

  it('does not save rejected items', () => {
    persistUploads([makeItem({ status: 'rejected' })])
    expect(localStorage.getItem('ideawise:uploads')).toBeNull()
  })

  it('does not save items that have no session', () => {
    persistUploads([makeItem({ session: undefined, status: 'paused' })])
    expect(localStorage.getItem('ideawise:uploads')).toBeNull()
  })

  it('removes the storage key when no resumable items remain', () => {
    localStorage.setItem('ideawise:uploads', 'old-data')
    persistUploads([makeItem({ status: 'completed' })])
    expect(localStorage.getItem('ideawise:uploads')).toBeNull()
  })

  it('stores only id and session — no File or other client-only fields', () => {
    persistUploads([makeItem({ status: 'uploading', error: 'transient error' })])

    const [stored] = JSON.parse(localStorage.getItem('ideawise:uploads')!)
    expect(Object.keys(stored)).toEqual(['id', 'session'])
  })

  it('stores multiple resumable items', () => {
    persistUploads([
      makeItem({ id: 'a', status: 'paused' }),
      makeItem({ id: 'b', status: 'uploading' }),
    ])

    const stored = JSON.parse(localStorage.getItem('ideawise:uploads')!)
    expect(stored.map((e: { id: string }) => e.id)).toEqual(['a', 'b'])
  })
})
