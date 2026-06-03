import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  initiateUpload,
  uploadChunk,
  finalizeUpload,
  cancelUpload,
  getUploadStatus,
  deleteUpload,
} from './uploads'
import type { UploadSession } from './uploads'

const SESSION: UploadSession = {
  uploadId: 'abc-123',
  filename: 'test.mp4',
  mimeType: 'video/mp4',
  fileSize: 2048,
  chunkSize: 1024,
  totalChunks: 2,
  uploadedChunks: [],
  uploadedChunkCount: 0,
  progress: 0,
  status: 'initiated',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  completedAt: null,
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(200, SESSION))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('initiateUpload', () => {
  it('POSTs to /api/upload/initiate with file metadata', async () => {
    const file = new File(['hello world'], 'clip.mp4', { type: 'video/mp4' })
    const result = await initiateUpload(file, 1024)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/initiate')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      fileSize: file.size,
      chunkSize: 1024,
    })

    expect(result).toEqual(SESSION)
  })

  it('uses application/octet-stream when file.type is empty', async () => {
    const file = new File(['data'], 'noext', { type: '' })
    await initiateUpload(file, 1024)
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string).mimeType).toBe('application/octet-stream')
  })
})

describe('uploadChunk', () => {
  it('POSTs chunk as FormData to /api/upload/chunk', async () => {
    const chunk = new Blob(['chunk-data'])
    const result = await uploadChunk('abc-123', 0, chunk)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/chunk')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)

    const fd = init.body as FormData
    expect(fd.get('uploadId')).toBe('abc-123')
    expect(fd.get('chunkIndex')).toBe('0')
    expect(fd.get('chunk')).toBeInstanceOf(Blob)

    expect(result).toEqual(SESSION)
  })
})

describe('finalizeUpload', () => {
  it('POSTs uploadId to /api/upload/finalize', async () => {
    await finalizeUpload('abc-123')
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/finalize')
    expect(JSON.parse(init.body as string)).toEqual({ uploadId: 'abc-123' })
  })
})

describe('cancelUpload', () => {
  it('POSTs to /api/upload/cancel/:id', async () => {
    await cancelUpload('abc-123')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/cancel/abc-123')
  })
})

describe('getUploadStatus', () => {
  it('GETs /api/upload/status/:id', async () => {
    await getUploadStatus('abc-123')
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/status/abc-123')
    expect(init.method).toBe('GET')
  })
})

describe('deleteUpload', () => {
  it('DELETEs /api/upload/:id and returns undefined on 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))
    const result = await deleteUpload('abc-123')
    expect(result).toBeUndefined()
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/api/upload/abc-123')
    expect(init.method).toBe('DELETE')
  })
})

describe('error handling', () => {
  it('throws with server error message when JSON error payload is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: { message: 'File too large' } }),
      }),
    )
    await expect(initiateUpload(new File([], 'f.jpg', { type: 'image/jpeg' }), 1024)).rejects.toThrow(
      'File too large',
    )
  })

  it('falls back to error.code when message is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { code: 'INVALID_TYPE' } }),
      }),
    )
    await expect(initiateUpload(new File([], 'f.jpg', { type: 'image/jpeg' }), 1024)).rejects.toThrow(
      'INVALID_TYPE',
    )
  })

  it('falls back to HTTP status message when JSON parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError('bad json')),
      }),
    )
    await expect(initiateUpload(new File([], 'f.jpg', { type: 'image/jpeg' }), 1024)).rejects.toThrow(
      'Request failed with status 500',
    )
  })
})
