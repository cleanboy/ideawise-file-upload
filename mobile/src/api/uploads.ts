import * as FileSystem from 'expo-file-system/legacy'

const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429
  }
}

export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (!isNaN(seconds) && seconds > 0) return Math.round(seconds * 1000)
  const date = new Date(value)
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now()
    return ms > 0 ? ms : undefined
  }
  return undefined
}

export type UploadSession = {
  uploadId: string
  filename: string
  mimeType: string
  fileSize: number
  chunkSize: number
  totalChunks: number
  uploadedChunks: number[]
  uploadedChunkCount: number
  progress: number
  status: 'initiated' | 'uploading' | 'completed' | 'cancelled' | 'failed'
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type UploadApiError = {
  error?: {
    code?: string
    message?: string
  }
}

export async function initiateUpload(
  name: string,
  mimeType: string,
  fileSize: number,
  chunkSize: number,
): Promise<UploadSession> {
  return requestJson<UploadSession>('/api/upload/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: name, mimeType, fileSize, chunkSize }),
  })
}

export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  chunkUri: string,
): Promise<UploadSession> {
  const result = await FileSystem.uploadAsync(
    `${API_BASE_URL}/api/upload/chunk`,
    chunkUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'chunk',
      parameters: {
        uploadId,
        chunkIndex: String(chunkIndex),
      },
    },
  )

  if (result.status < 200 || result.status >= 300) {
    let message = `Request failed with status ${result.status}`
    try {
      const payload = JSON.parse(result.body) as UploadApiError
      message = payload.error?.message ?? payload.error?.code ?? message
    } catch {
      // keep fallback message
    }
    const retryAfterRaw = Object.entries(result.headers ?? {})
      .find(([k]) => k.toLowerCase() === 'retry-after')?.[1]
    throw new ApiError(message, result.status, parseRetryAfterMs(retryAfterRaw))
  }

  return JSON.parse(result.body) as UploadSession
}

export async function finalizeUpload(uploadId: string): Promise<UploadSession> {
  return requestJson<UploadSession>('/api/upload/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  })
}

export async function cancelUpload(uploadId: string): Promise<UploadSession> {
  return requestJson<UploadSession>(`/api/upload/cancel/${uploadId}`, {
    method: 'POST',
  })
}

export async function getUploadStatus(uploadId: string): Promise<UploadSession> {
  return requestJson<UploadSession>(`/api/upload/status/${uploadId}`, {
    method: 'GET',
  })
}

export async function deleteUpload(uploadId: string): Promise<void> {
  await requestJson<void>(`/api/upload/${uploadId}`, { method: 'DELETE' })
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init)

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const payload = (await response.json()) as UploadApiError
      message = payload.error?.message ?? payload.error?.code ?? message
    } catch {
      // keep fallback message
    }
    throw new ApiError(message, response.status, parseRetryAfterMs(response.headers.get('Retry-After')))
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
