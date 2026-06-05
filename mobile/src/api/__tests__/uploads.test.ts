import * as FileSystem from 'expo-file-system/legacy'
import { ApiError, parseRetryAfterMs, uploadChunk } from '../uploads'

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { MULTIPART: 'multipart' },
  uploadAsync: jest.fn(),
}))

const mockUploadAsync = (FileSystem as { uploadAsync: jest.Mock }).uploadAsync

function makeUploadResult(
  status: number,
  body: string = '{}',
  headers: Record<string, string> = {},
) {
  return { status, body, headers }
}

beforeEach(() => jest.clearAllMocks())

describe('ApiError', () => {
  it('has name ApiError', () => {
    expect(new ApiError('oops', 500).name).toBe('ApiError')
  })

  it('stores status', () => {
    expect(new ApiError('oops', 413).status).toBe(413)
  })

  it('stores retryAfterMs', () => {
    expect(new ApiError('oops', 429, 5000).retryAfterMs).toBe(5000)
  })

  it.each([429, 500, 503])('isRetryable is true for %i', (status) => {
    expect(new ApiError('x', status).isRetryable).toBe(true)
  })

  it.each([400, 401, 403, 404, 413, 422])('isRetryable is false for %i', (status) => {
    expect(new ApiError('x', status).isRetryable).toBe(false)
  })
})

describe('parseRetryAfterMs', () => {
  it('returns undefined for null', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(parseRetryAfterMs('')).toBeUndefined()
  })

  it('converts a numeric seconds value to milliseconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30000)
  })

  it('returns undefined for zero seconds', () => {
    expect(parseRetryAfterMs('0')).toBeUndefined()
  })

  it('returns undefined for negative seconds', () => {
    expect(parseRetryAfterMs('-5')).toBeUndefined()
  })

  it('parses an HTTP-date value in the future', () => {
    const future = new Date(Date.now() + 10000).toUTCString()
    const ms = parseRetryAfterMs(future)
    expect(ms).toBeGreaterThan(9000)
    expect(ms).toBeLessThanOrEqual(10000)
  })

  it('returns undefined for an HTTP-date in the past', () => {
    const past = new Date(Date.now() - 1000).toUTCString()
    expect(parseRetryAfterMs(past)).toBeUndefined()
  })

  it('returns undefined for an unparseable string', () => {
    expect(parseRetryAfterMs('banana')).toBeUndefined()
  })
})

describe('uploadChunk', () => {
  it('throws ApiError with correct status on a non-2xx response', async () => {
    mockUploadAsync.mockResolvedValue(makeUploadResult(429))

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(429)
  })

  it('uses the server error message when the body contains one', async () => {
    mockUploadAsync.mockResolvedValue(
      makeUploadResult(400, JSON.stringify({ error: { message: 'Invalid chunk index' } })),
    )

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect((err as ApiError).message).toBe('Invalid chunk index')
  })

  it('falls back to status text when body has no error message', async () => {
    mockUploadAsync.mockResolvedValue(makeUploadResult(500, '{}'))

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect((err as ApiError).message).toBe('Request failed with status 500')
  })

  it('parses Retry-After from response headers (case-insensitive)', async () => {
    mockUploadAsync.mockResolvedValue(makeUploadResult(429, '{}', { 'retry-after': '60' }))

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect((err as ApiError).retryAfterMs).toBe(60000)
  })

  it('parses Retry-After with mixed-case header key', async () => {
    mockUploadAsync.mockResolvedValue(makeUploadResult(429, '{}', { 'Retry-After': '30' }))

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect((err as ApiError).retryAfterMs).toBe(30000)
  })

  it('leaves retryAfterMs undefined when header is absent', async () => {
    mockUploadAsync.mockResolvedValue(makeUploadResult(429, '{}', {}))

    const err = await uploadChunk('id', 0, 'file:///tmp/chunk').catch((e: unknown) => e)

    expect((err as ApiError).retryAfterMs).toBeUndefined()
  })

  it('resolves with the parsed session on a 2xx response', async () => {
    const session = { uploadId: 'abc', progress: 50, status: 'uploading' }
    mockUploadAsync.mockResolvedValue(makeUploadResult(200, JSON.stringify(session)))

    await expect(uploadChunk('abc', 0, 'file:///tmp/chunk')).resolves.toMatchObject({
      uploadId: 'abc',
    })
  })
})
