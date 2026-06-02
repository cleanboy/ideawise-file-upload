import type { UploadSession } from '../api/uploads'

export type UploadStatus = 'queued' | 'uploading' | 'completed' | 'cancelled' | 'failed' | 'rejected'

export type UploadItem = {
  id: string
  file: File
  status: UploadStatus
  progress: number
  uploadedChunks: number
  totalChunks: number
  error?: string
  session?: UploadSession
}
