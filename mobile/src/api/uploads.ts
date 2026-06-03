const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

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
  const formData = new FormData()
  formData.append('uploadId', uploadId)
  formData.append('chunkIndex', String(chunkIndex))
  formData.append('chunk', { uri: chunkUri, name: 'chunk', type: 'application/octet-stream' } as unknown as Blob)

  return requestJson<UploadSession>('/api/upload/chunk', {
    method: 'POST',
    body: formData,
  })
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
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
