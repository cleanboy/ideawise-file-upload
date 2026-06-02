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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:8080'

export async function initiateUpload(file: File, chunkSize: number): Promise<UploadSession> {
  return requestJson<UploadSession>('/api/upload/initiate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      chunkSize,
    }),
  })
}

export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
): Promise<UploadSession> {
  const formData = new FormData()
  formData.append('uploadId', uploadId)
  formData.append('chunkIndex', String(chunkIndex))
  formData.append('chunk', chunk)

  return requestJson<UploadSession>('/api/upload/chunk', {
    method: 'POST',
    body: formData,
  })
}

export async function finalizeUpload(uploadId: string): Promise<UploadSession> {
  return requestJson<UploadSession>('/api/upload/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
  await requestJson<void>(`/api/upload/${uploadId}`, {
    method: 'DELETE',
  })
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init)

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const payload = (await response.json()) as UploadApiError
      message = payload.error?.message ?? payload.error?.code ?? message
    } catch {
      // Keep the fallback HTTP status message.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
