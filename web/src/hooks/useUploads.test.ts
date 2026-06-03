import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUploads } from './useUploads'
import * as api from '../api/uploads'
import type { UploadSession } from '../api/uploads'

vi.mock('../api/uploads')
vi.mock('../utils/sleep', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }))

const MB = 1024 * 1024

function makeFile(name: string, type: string, sizeBytes = 512): File {
  return new File([new Uint8Array(sizeBytes)], name, { type })
}

function makeSession(overrides?: Partial<UploadSession>): UploadSession {
  return {
    uploadId: 'upload-1',
    filename: 'test.jpg',
    mimeType: 'image/jpeg',
    fileSize: 512,
    chunkSize: MB,
    totalChunks: 1,
    uploadedChunks: [],
    uploadedChunkCount: 0,
    progress: 0,
    status: 'initiated',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

function mockSuccessfulUpload() {
  const chunkSession = makeSession({ uploadedChunkCount: 1, progress: 100, status: 'uploading' })
  const finalSession = makeSession({ status: 'completed', progress: 100, completedAt: '2026-01-01T00:01:00Z' })
  vi.mocked(api.initiateUpload).mockResolvedValue(makeSession())
  vi.mocked(api.uploadChunk).mockResolvedValue(chunkSession)
  vi.mocked(api.finalizeUpload).mockResolvedValue(finalSession)
  return { finalSession }
}

// Runs a complete upload for a single file and returns the item with its session.
async function runSuccessfulUpload(file = makeFile('photo.jpg', 'image/jpeg')) {
  mockSuccessfulUpload()
  const { result } = renderHook(() => useUploads())
  act(() => { result.current.queueFiles([file]) })
  await act(async () => { await result.current.startUpload(result.current.uploads[0]) })
  return result
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── queueFiles ──────────────────────────────────────────────────────────────

describe('queueFiles', () => {
  it('adds a valid image file with status queued', () => {
    const { result } = renderHook(() => useUploads())
    const file = makeFile('photo.jpg', 'image/jpeg')

    act(() => { result.current.queueFiles([file]) })

    expect(result.current.uploads).toHaveLength(1)
    expect(result.current.uploads[0]).toMatchObject({ file, status: 'queued', progress: 0, uploadedChunks: 0 })
  })

  it('adds a valid video file with status queued', () => {
    const { result } = renderHook(() => useUploads())

    act(() => { result.current.queueFiles([makeFile('clip.mp4', 'video/mp4')]) })

    expect(result.current.uploads[0].status).toBe('queued')
  })

  it('rejects a file with an invalid MIME type', () => {
    const { result } = renderHook(() => useUploads())

    act(() => { result.current.queueFiles([makeFile('doc.pdf', 'application/pdf')]) })

    expect(result.current.uploads[0].status).toBe('rejected')
    expect(result.current.uploads[0].error).toMatch(/Invalid file type/)
  })

  it('rejects a file that exceeds the 2 GB size limit', () => {
    const { result } = renderHook(() => useUploads())
    const file = makeFile('huge.mp4', 'video/mp4')
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 * 1024 + 1 })

    act(() => { result.current.queueFiles([file]) })

    expect(result.current.uploads[0].status).toBe('rejected')
    expect(result.current.uploads[0].error).toMatch(/2 GB/)
  })

  it('rejects files beyond the 10-file per-selection limit', () => {
    const { result } = renderHook(() => useUploads())
    const files = Array.from({ length: 12 }, (_, i) => makeFile(`photo${i}.jpg`, 'image/jpeg'))

    act(() => { result.current.queueFiles(files) })

    const statuses = result.current.uploads.map((u) => u.status)
    expect(statuses.slice(0, 10).every((s) => s === 'queued')).toBe(true)
    expect(statuses[10]).toBe('rejected')
    expect(statuses[11]).toBe('rejected')
    expect(result.current.uploads[10].error).toMatch(/10-file limit/)
  })

  it('accepts exactly 10 files with no rejections', () => {
    const { result } = renderHook(() => useUploads())
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`photo${i}.jpg`, 'image/jpeg'))

    act(() => { result.current.queueFiles(files) })

    expect(result.current.uploads.every((u) => u.status === 'queued')).toBe(true)
  })

  it('calculates totalChunks correctly based on file size', () => {
    const { result } = renderHook(() => useUploads())
    const twoAndAHalfChunks = makeFile('clip.mp4', 'video/mp4', MB * 2 + 1)

    act(() => { result.current.queueFiles([twoAndAHalfChunks]) })

    expect(result.current.uploads[0].totalChunks).toBe(3)
  })

  it('prepends newly queued items in front of the existing list', () => {
    const { result } = renderHook(() => useUploads())

    act(() => { result.current.queueFiles([makeFile('first.jpg', 'image/jpeg')]) })
    act(() => { result.current.queueFiles([makeFile('second.jpg', 'image/jpeg')]) })

    expect(result.current.uploads[0].file.name).toBe('second.jpg')
    expect(result.current.uploads[1].file.name).toBe('first.jpg')
  })
})

// ─── startUpload ─────────────────────────────────────────────────────────────

describe('startUpload', () => {
  it('does nothing when the item status is rejected', async () => {
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('doc.pdf', 'application/pdf')]) })
    const item = result.current.uploads[0]

    await act(async () => { await result.current.startUpload(item) })

    expect(api.initiateUpload).not.toHaveBeenCalled()
  })

  it('calls initiateUpload → uploadChunk → finalizeUpload and sets status to completed', async () => {
    mockSuccessfulUpload()
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(api.initiateUpload).toHaveBeenCalledOnce()
    expect(api.uploadChunk).toHaveBeenCalledOnce()
    expect(api.finalizeUpload).toHaveBeenCalledOnce()
    expect(result.current.uploads[0].status).toBe('completed')
  })

  it('calls getUploadStatus instead of initiateUpload when a resumable session exists', async () => {
    // First run to attach a session (status: 'completed' is resumable)
    const result = await runSuccessfulUpload()

    // Set up mocks for the resumed upload (all chunks already done)
    vi.mocked(api.getUploadStatus).mockResolvedValue(
      makeSession({ uploadedChunks: [0], uploadedChunkCount: 1, status: 'uploading' }),
    )
    vi.mocked(api.finalizeUpload).mockResolvedValue(makeSession({ status: 'completed' }))

    const itemWithSession = result.current.uploads[0]
    await act(async () => { await result.current.startUpload(itemWithSession) })

    expect(api.getUploadStatus).toHaveBeenCalledWith('upload-1')
    // initiateUpload was only called during the first run, not the resume
    expect(api.initiateUpload).toHaveBeenCalledTimes(1)
  })

  it('calls initiateUpload (not getUploadStatus) after session has been cancelled', async () => {
    // Run first upload, then cancel to give item a session with status 'cancelled'
    const result = await runSuccessfulUpload()
    vi.mocked(api.cancelUpload).mockResolvedValue(makeSession({ status: 'cancelled' }))
    await act(async () => { await result.current.cancelItem(result.current.uploads[0]) })

    // Reset call counts, set up fresh mocks
    vi.mocked(api.initiateUpload).mockResolvedValue(makeSession())
    vi.mocked(api.uploadChunk).mockResolvedValue(makeSession({ uploadedChunkCount: 1, progress: 100 }))
    vi.mocked(api.finalizeUpload).mockResolvedValue(makeSession({ status: 'completed' }))

    const itemWithCancelledSession = result.current.uploads[0]
    await act(async () => { await result.current.startUpload(itemWithCancelledSession) })

    expect(api.getUploadStatus).not.toHaveBeenCalled()
    expect(api.initiateUpload).toHaveBeenCalledTimes(2) // once per startUpload call
  })

  it('skips chunks already listed in the session and only uploads the remainder', async () => {
    // Session reports chunk 0 is done; only chunk 1 should be uploaded
    vi.mocked(api.initiateUpload).mockResolvedValue(
      makeSession({ totalChunks: 2, uploadedChunks: [0], uploadedChunkCount: 1, progress: 50 }),
    )
    vi.mocked(api.uploadChunk).mockResolvedValue(
      makeSession({ totalChunks: 2, uploadedChunkCount: 2, progress: 100 }),
    )
    vi.mocked(api.finalizeUpload).mockResolvedValue(makeSession({ status: 'completed' }))

    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('clip.mp4', 'video/mp4')]) })
    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(api.uploadChunk).toHaveBeenCalledTimes(1)
    expect(api.uploadChunk).toHaveBeenCalledWith('upload-1', 1, expect.any(Blob))
  })

  it('sets status to failed with error message when initiateUpload throws', async () => {
    vi.mocked(api.initiateUpload).mockRejectedValue(new Error('Server unavailable'))
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('failed')
    expect(result.current.uploads[0].error).toBe('Server unavailable')
  })

  it('sets status to failed with error message when finalizeUpload throws', async () => {
    vi.mocked(api.initiateUpload).mockResolvedValue(makeSession())
    vi.mocked(api.uploadChunk).mockResolvedValue(makeSession({ uploadedChunkCount: 1, progress: 100 }))
    vi.mocked(api.finalizeUpload).mockRejectedValue(new Error('Finalize failed'))

    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('failed')
    expect(result.current.uploads[0].error).toBe('Finalize failed')
  })
})

// ─── pauseItem ───────────────────────────────────────────────────────────────

describe('pauseItem', () => {
  it('sets status to paused and records pausedProgress from current progress', () => {
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    const item = result.current.uploads[0] // progress is 0

    act(() => { result.current.pauseItem(item) })

    expect(result.current.uploads[0].status).toBe('paused')
    expect(result.current.uploads[0].pausedProgress).toBe(0)
  })
})

// ─── cancelItem ──────────────────────────────────────────────────────────────

describe('cancelItem', () => {
  it('sets status to cancelled immediately when the item has no session', async () => {
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    const item = result.current.uploads[0]

    await act(async () => { await result.current.cancelItem(item) })

    expect(result.current.uploads[0].status).toBe('cancelled')
    expect(api.cancelUpload).not.toHaveBeenCalled()
  })

  it('calls cancelUpload and sets status to cancelled when item has a session', async () => {
    const result = await runSuccessfulUpload()
    vi.mocked(api.cancelUpload).mockResolvedValue(makeSession({ status: 'cancelled' }))

    await act(async () => { await result.current.cancelItem(result.current.uploads[0]) })

    expect(api.cancelUpload).toHaveBeenCalledWith('upload-1')
    expect(result.current.uploads[0].status).toBe('cancelled')
  })

  it('sets status to cancelled with error when cancelUpload throws', async () => {
    const result = await runSuccessfulUpload()
    vi.mocked(api.cancelUpload).mockRejectedValue(new Error('Cancel rejected'))

    await act(async () => { await result.current.cancelItem(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('cancelled')
    expect(result.current.uploads[0].error).toBe('Cancel rejected')
  })
})

// ─── removeItem ──────────────────────────────────────────────────────────────

describe('removeItem', () => {
  it('removes the item from the list when it has no session', async () => {
    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    const item = result.current.uploads[0]

    await act(async () => { await result.current.removeItem(item) })

    expect(result.current.uploads).toHaveLength(0)
    expect(api.deleteUpload).not.toHaveBeenCalled()
  })

  it('calls deleteUpload and removes the item when it has a session', async () => {
    const result = await runSuccessfulUpload()
    vi.mocked(api.deleteUpload).mockResolvedValue(undefined)

    await act(async () => { await result.current.removeItem(result.current.uploads[0]) })

    expect(api.deleteUpload).toHaveBeenCalledWith('upload-1')
    expect(result.current.uploads).toHaveLength(0)
  })

  it('keeps the item and sets an error when deleteUpload throws', async () => {
    const result = await runSuccessfulUpload()
    vi.mocked(api.deleteUpload).mockRejectedValue(new Error('Delete failed'))

    await act(async () => { await result.current.removeItem(result.current.uploads[0]) })

    expect(result.current.uploads).toHaveLength(1)
    expect(result.current.uploads[0].error).toBe('Delete failed')
  })
})

// ─── retry logic ─────────────────────────────────────────────────────────────

describe('retry logic', () => {
  it('retries a failing chunk and succeeds when an attempt eventually works', async () => {
    vi.mocked(api.initiateUpload).mockResolvedValue(makeSession())
    vi.mocked(api.uploadChunk)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(makeSession({ uploadedChunkCount: 1, progress: 100 }))
    vi.mocked(api.finalizeUpload).mockResolvedValue(makeSession({ status: 'completed' }))

    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    // 2 failures + 1 success = 3 total calls
    expect(api.uploadChunk).toHaveBeenCalledTimes(3)
    expect(result.current.uploads[0].status).toBe('completed')
  })

  it('sets status to failed after exhausting all 3 retries (4 total attempts)', async () => {
    vi.mocked(api.initiateUpload).mockResolvedValue(makeSession())
    vi.mocked(api.uploadChunk).mockRejectedValue(new Error('Persistent error'))

    const { result } = renderHook(() => useUploads())
    act(() => { result.current.queueFiles([makeFile('photo.jpg', 'image/jpeg')]) })
    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(api.uploadChunk).toHaveBeenCalledTimes(4)
    expect(result.current.uploads[0].status).toBe('failed')
    expect(result.current.uploads[0].error).toMatch(/failed after 3 retries/)
  })
})
