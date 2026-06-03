import { useRef, useState } from 'react'
import {
  cancelUpload,
  deleteUpload,
  finalizeUpload,
  getUploadStatus,
  initiateUpload,
  uploadChunk,
  type UploadSession,
} from '../api/uploads'
import type { UploadItem } from '../types/uploads'
import { sleep } from '../utils/sleep'

const CHUNK_SIZE = 1024 * 1024
const MAX_PARALLEL_CHUNKS = 3
const MAX_CONCURRENT_UPLOADS = 3
const MAX_CHUNK_RETRIES = 3
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
const MAX_FILES_PER_SELECTION = 10
const ACCEPTED_TYPES = ['image/', 'video/']

export function useUploads() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const cancelledUploads = useRef(new Set<string>())
  const pausedUploads = useRef(new Set<string>())
  const activeUploadCount = useRef(0)
  const uploadWaiters = useRef<Array<() => void>>([])

  function acquireUploadSlot(): Promise<void> {
    if (activeUploadCount.current < MAX_CONCURRENT_UPLOADS) {
      activeUploadCount.current++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      uploadWaiters.current.push(resolve)
    })
  }

  function releaseUploadSlot() {
    const next = uploadWaiters.current.shift()
    if (next) {
      next() // transfer slot directly — count stays the same
    } else {
      activeUploadCount.current--
    }
  }

  function queueFiles(files: FileList | File[]) {
    let acceptedCount = 0

    const items = Array.from(files).map((file) => {
      let rejectionReason: string | undefined

      if (!ACCEPTED_TYPES.some((prefix) => file.type.startsWith(prefix))) {
        rejectionReason = 'Invalid file type. Only images and videos are accepted.'
      } else if (file.size > MAX_FILE_SIZE) {
        rejectionReason = 'File exceeds the 2 GB size limit.'
      } else if (acceptedCount >= MAX_FILES_PER_SELECTION) {
        rejectionReason = `Selection exceeds the ${MAX_FILES_PER_SELECTION}-file limit per upload.`
      } else {
        acceptedCount++
      }

      if (rejectionReason) {
        return {
          id: crypto.randomUUID(),
          file,
          status: 'rejected' as const,
          progress: 0,
          uploadedChunks: 0,
          totalChunks: 0,
          error: rejectionReason,
        }
      }

      return {
        id: crypto.randomUUID(),
        file,
        status: 'queued' as const,
        progress: 0,
        uploadedChunks: 0,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      }
    })

    setUploads((current) => [...items, ...current])
  }

  async function startUpload(item: UploadItem) {
    if (item.status === 'rejected') return
    cancelledUploads.current.delete(item.id)
    pausedUploads.current.delete(item.id)

    await acquireUploadSlot()

    if (cancelledUploads.current.has(item.id)) {
      releaseUploadSlot()
      return
    }

    updateUpload(item.id, { status: 'uploading', pausedProgress: undefined, error: undefined })

    try {
      const existingSession = item.session
      const shouldResume =
        existingSession?.status !== undefined &&
        existingSession.status !== 'failed' &&
        existingSession.status !== 'cancelled'
      const session = shouldResume
        ? await getUploadStatus(existingSession.uploadId)
        : await initiateUpload(item.file, CHUNK_SIZE)

      updateFromSession(item.id, session)

      await uploadChunks(item, session)

      if (cancelledUploads.current.has(item.id)) {
        return
      }

      if (pausedUploads.current.has(item.id)) {
        return
      }

      const completedSession = await finalizeUpload(session.uploadId)
      updateFromSession(item.id, completedSession, { status: 'completed' })
    } catch (error) {
      if (pausedUploads.current.has(item.id)) {
        return
      }
      updateUpload(item.id, {
        status: cancelledUploads.current.has(item.id) ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    } finally {
      releaseUploadSlot()
    }
  }

  async function cancelItem(item: UploadItem) {
    cancelledUploads.current.add(item.id)

    if (item.session?.uploadId) {
      try {
        const session = await cancelUpload(item.session.uploadId)
        updateFromSession(item.id, session, { status: 'cancelled' })
        return
      } catch (error) {
        updateUpload(item.id, {
          status: 'cancelled',
          error: error instanceof Error ? error.message : undefined,
        })
        return
      }
    }

    updateUpload(item.id, { status: 'cancelled' })
  }

  function pauseItem(item: UploadItem) {
    pausedUploads.current.add(item.id)
    updateUpload(item.id, { status: 'paused', pausedProgress: item.progress })
  }

  async function removeItem(item: UploadItem) {
    const terminalStatuses = new Set(['completed', 'cancelled', 'rejected'])

    if (!terminalStatuses.has(item.status) && item.session?.uploadId) {
      cancelledUploads.current.add(item.id)
      try {
        await deleteUpload(item.session.uploadId)
      } catch (error) {
        updateUpload(item.id, {
          error: error instanceof Error ? error.message : 'Upload could not be removed',
        })
        return
      }
    }

    setUploads((current) => current.filter((upload) => upload.id !== item.id))
  }

  async function uploadChunks(item: UploadItem, session: UploadSession) {
    const uploadedChunks = new Set(session.uploadedChunks)
    const chunkIndexes = Array.from({ length: session.totalChunks }, (_, index) => index).filter(
      (index) => !uploadedChunks.has(index),
    )
    let nextIndex = 0
    let firstError: Error | undefined

    async function worker() {
      while (nextIndex < chunkIndexes.length && !firstError) {
        if (cancelledUploads.current.has(item.id) || pausedUploads.current.has(item.id)) {
          return
        }

        const chunkIndex = chunkIndexes[nextIndex]
        nextIndex += 1

        const start = chunkIndex * session.chunkSize
        const end = Math.min(start + session.chunkSize, item.file.size)
        const chunk = item.file.slice(start, end)

        try {
          const updatedSession = await uploadChunkWithRetry(item.id, session, chunkIndex, chunk)
          const statusOverride = pausedUploads.current.has(item.id) ? { status: 'paused' as const } : {}
          updateFromSession(item.id, updatedSession, { error: undefined, ...statusOverride })
        } catch (error) {
          firstError = error instanceof Error ? error : new Error('Chunk upload failed')
        }
      }
    }

    await Promise.allSettled(
      Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, session.totalChunks) }, () => worker()),
    )

    if (firstError) {
      throw firstError
    }
  }

  async function uploadChunkWithRetry(
    itemId: string,
    session: UploadSession,
    chunkIndex: number,
    chunk: Blob,
  ) {
    for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES + 1; attempt += 1) {
      try {
        return await uploadChunk(session.uploadId, chunkIndex, chunk)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chunk could not be uploaded.'

        if (attempt > MAX_CHUNK_RETRIES) {
          throw new Error(
            `Chunk ${chunkIndex + 1}/${session.totalChunks} failed after ${MAX_CHUNK_RETRIES} retries: ${message}`,
            { cause: error },
          )
        }

        updateUpload(itemId, {
          error: `Chunk ${chunkIndex + 1}/${session.totalChunks} failed: ${message}. Retrying ${attempt}/${MAX_CHUNK_RETRIES}.`,
        })

        await sleep(500 * 2 ** (attempt - 1))
      }
    }

    throw new Error(`Chunk ${chunkIndex + 1}/${session.totalChunks} could not be uploaded.`)
  }

  function updateFromSession(
    id: string,
    session: UploadSession,
    override?: Partial<UploadItem>,
  ) {
    updateUpload(id, {
      session,
      progress: session.progress,
      uploadedChunks: session.uploadedChunkCount,
      totalChunks: session.totalChunks,
      status: session.status === 'completed' ? 'completed' : 'uploading',
      ...override,
    })
  }

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    )
  }

  return {
    uploads,
    queueFiles,
    startUpload,
    pauseItem,
    cancelItem,
    removeItem,
  }
}
