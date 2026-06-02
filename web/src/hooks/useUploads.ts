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
const MAX_CHUNK_RETRIES = 3

export function useUploads() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const cancelledUploads = useRef(new Set<string>())

  function queueFiles(files: FileList | File[]) {
    const items = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'queued' as const,
      progress: 0,
      uploadedChunks: 0,
      totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    }))

    setUploads((current) => [...items, ...current])
  }

  async function startUpload(item: UploadItem) {
    cancelledUploads.current.delete(item.id)
    updateUpload(item.id, { status: 'uploading', error: undefined })

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

      const completedSession = await finalizeUpload(session.uploadId)
      updateFromSession(item.id, completedSession, { status: 'completed' })
    } catch (error) {
      updateUpload(item.id, {
        status: cancelledUploads.current.has(item.id) ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : 'Upload failed',
      })
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

  async function removeItem(item: UploadItem) {
    cancelledUploads.current.add(item.id)

    if (item.session?.uploadId) {
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
        if (cancelledUploads.current.has(item.id)) {
          return
        }

        const chunkIndex = chunkIndexes[nextIndex]
        nextIndex += 1

        const start = chunkIndex * session.chunkSize
        const end = Math.min(start + session.chunkSize, item.file.size)
        const chunk = item.file.slice(start, end)

        try {
          const updatedSession = await uploadChunkWithRetry(item.id, session, chunkIndex, chunk)
          updateFromSession(item.id, updatedSession, { error: undefined })
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
    cancelItem,
    removeItem,
  }
}
