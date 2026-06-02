import type { UploadSession } from '../api/uploads'

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'failed' | 'rejected'

export type UploadItem = {
  id: string
  file: File
  status: UploadStatus
  progress: number
  pausedProgress?: number
  uploadedChunks: number
  totalChunks: number
  error?: string
  session?: UploadSession
}
