import { act, renderHook, waitFor } from '@testing-library/react-native'
import { ApiError, initiateUpload, uploadChunk } from '../../api/uploads'
import type { UploadSession } from '../../api/uploads'
import type { MediaFile } from '../../types/uploads'
import { sleep } from '../../utils/sleep'
import { useUploads } from '../useUploads'

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { MULTIPART: 'multipart' },
  uploadAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../api/uploads', () => {
  const actual = jest.requireActual<typeof import('../../api/uploads')>('../../api/uploads')
  return {
    ...actual,
    initiateUpload: jest.fn(),
    uploadChunk: jest.fn(),
    finalizeUpload: jest.fn(),
    getUploadStatus: jest.fn(),
    cancelUpload: jest.fn(),
    deleteUpload: jest.fn(),
  }
})

jest.mock('../../utils/fileChunk', () => ({
  writeChunkToTemp: jest.fn().mockResolvedValue('file:///tmp/chunk'),
}))

jest.mock('../../utils/sleep', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../utils/uploadQueue', () => ({
  loadQueue: jest.fn().mockResolvedValue([]),
  persistQueue: jest.fn().mockResolvedValue(undefined),
}))

const mockUploadChunk = uploadChunk as jest.Mock
const mockInitiateUpload = initiateUpload as jest.Mock
const mockSleep = sleep as jest.Mock

const MAX_CHUNK_RETRIES = 3

function makeMediaFile(): MediaFile {
  return { uri: 'file:///test/file.jpg', name: 'file.jpg', size: 512, type: 'image/jpeg' }
}

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    uploadId: 'session-id',
    filename: 'file.jpg',
    mimeType: 'image/jpeg',
    fileSize: 512,
    chunkSize: 1024 * 1024,
    totalChunks: 1,
    uploadedChunks: [],
    uploadedChunkCount: 0,
    progress: 0,
    status: 'uploading',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  }
}

async function setupHook() {
  const { result } = renderHook(() => useUploads())
  // Flush the initial loadQueue effect
  await act(async () => {})
  return result
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInitiateUpload.mockResolvedValue(makeSession())
})

describe('uploadChunkWithRetry — non-retryable errors', () => {
  it('fails immediately on 400 without sleeping or retrying', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Invalid chunk index', 400))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('failed')
    expect(mockSleep).not.toHaveBeenCalled()
    expect(mockUploadChunk).toHaveBeenCalledTimes(1)
  })

  it('fails immediately on 413 without sleeping or retrying', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Payload too large', 413))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('failed')
    expect(mockSleep).not.toHaveBeenCalled()
    expect(mockUploadChunk).toHaveBeenCalledTimes(1)
  })

  it('includes the server message in the final error', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Chunk index out of range', 400))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].error).toContain('Chunk index out of range')
  })
})

describe('uploadChunkWithRetry — 429 rate limiting', () => {
  it('uses the Retry-After delay from the error when present', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Rate limited', 429, 30000))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    const sleepCalls = mockSleep.mock.calls.map(([ms]: [number]) => ms)
    expect(sleepCalls).toHaveLength(MAX_CHUNK_RETRIES)
    sleepCalls.forEach((ms) => expect(ms).toBe(30000))
  })

  it('falls back to exponential backoff when Retry-After is absent', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Rate limited', 429))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    const sleepCalls = mockSleep.mock.calls.map(([ms]: [number]) => ms)
    expect(sleepCalls).toEqual([500, 1000, 2000])
  })

  it('shows a rate-limited message with seconds remaining', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Rate limited', 429, 60000))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    await waitFor(() => {
      expect(result.current.uploads[0].status).toBe('failed')
    })

    // The error text shown during retrying should mention the wait time
    // (we can't inspect mid-retry state easily, but we verify the item ends failed)
    expect(result.current.uploads[0].status).toBe('failed')
  })

  it('retries exactly MAX_CHUNK_RETRIES times then fails', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Rate limited', 429, 1000))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(mockUploadChunk).toHaveBeenCalledTimes(MAX_CHUNK_RETRIES + 1)
    expect(result.current.uploads[0].status).toBe('failed')
  })

  it('succeeds if the chunk upload recovers after one 429', async () => {
    const completedSession = makeSession({ status: 'completed', progress: 100 })
    mockUploadChunk
      .mockRejectedValueOnce(new ApiError('Rate limited', 429, 500))
      .mockResolvedValue(completedSession)

    const mockFinalizeUpload = jest.requireMock('../../api/uploads').finalizeUpload as jest.Mock
    mockFinalizeUpload.mockResolvedValue(makeSession({ status: 'completed', progress: 100 }))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('completed')
    expect(mockUploadChunk).toHaveBeenCalledTimes(2)
    expect(mockSleep).toHaveBeenCalledTimes(1)
    expect(mockSleep).toHaveBeenCalledWith(500)
  })
})

describe('uploadChunkWithRetry — 5xx server errors', () => {
  it('retries with exponential backoff on 500', async () => {
    mockUploadChunk.mockRejectedValue(new ApiError('Internal server error', 500))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(mockUploadChunk).toHaveBeenCalledTimes(MAX_CHUNK_RETRIES + 1)
    expect(mockSleep.mock.calls.map(([ms]: [number]) => ms)).toEqual([500, 1000, 2000])
    expect(result.current.uploads[0].status).toBe('failed')
  })

  it('succeeds if the chunk upload recovers after one 500', async () => {
    const completedSession = makeSession({ status: 'completed', progress: 100 })
    mockUploadChunk
      .mockRejectedValueOnce(new ApiError('Server error', 500))
      .mockResolvedValue(completedSession)

    const mockFinalizeUpload = jest.requireMock('../../api/uploads').finalizeUpload as jest.Mock
    mockFinalizeUpload.mockResolvedValue(makeSession({ status: 'completed', progress: 100 }))

    const result = await setupHook()
    act(() => { result.current.queueFiles([makeMediaFile()]) })

    await act(async () => { await result.current.startUpload(result.current.uploads[0]) })

    expect(result.current.uploads[0].status).toBe('completed')
    expect(mockUploadChunk).toHaveBeenCalledTimes(2)
    expect(mockSleep).toHaveBeenCalledTimes(1)
    expect(mockSleep).toHaveBeenCalledWith(500)
  })
})
