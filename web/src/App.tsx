import { useRef, useState } from 'react'
import './App.css'
import {
  cancelUpload,
  deleteUpload,
  finalizeUpload,
  getUploadStatus,
  initiateUpload,
  uploadChunk,
  type UploadSession,
} from './api/uploads'

const CHUNK_SIZE = 1024 * 1024
const MAX_PARALLEL_CHUNKS = 3
const MAX_CHUNK_RETRIES = 3

type UploadStatus = 'queued' | 'uploading' | 'completed' | 'cancelled' | 'failed'

type UploadItem = {
  id: string
  file: File
  status: UploadStatus
  progress: number
  uploadedChunks: number
  totalChunks: number
  error?: string
  session?: UploadSession
}

function App() {
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

  return (
    <main className="app-shell">
      <section className="upload-panel">
        <div>
          <p className="eyebrow">Media File Upload</p>
          <h1>Web uploader</h1>
          <p className="summary">
            Chunked uploads to the Symfony API with three parallel chunk requests per file.
          </p>
        </div>

        <label
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            queueFiles(event.dataTransfer.files)
          }}
        >
          <input
            multiple
            type="file"
            onChange={(event) => {
              if (event.target.files) {
                queueFiles(event.target.files)
                event.target.value = ''
              }
            }}
          />
          <span>Drop files here or choose files</span>
        </label>
      </section>

      <section className="upload-list" aria-label="Queued uploads">
        {uploads.length === 0 ? (
          <div className="empty-state">No files queued.</div>
        ) : (
          uploads.map((item) => (
            <article className="upload-card" key={item.id}>
              <div className="upload-card__header">
                <div>
                  <h2>{item.file.name}</h2>
                  <p>
                    {formatBytes(item.file.size)} · {item.uploadedChunks}/{item.totalChunks} chunks
                  </p>
                </div>
                <span className={`status status--${item.status}`}>{item.status}</span>
              </div>

              <div className="progress-bar" aria-label={`${item.file.name} progress`}>
                <span style={{ width: `${item.progress}%` }} />
              </div>

              {item.error ? <p className="error-message">{item.error}</p> : null}

              <div className="actions">
                <button
                  type="button"
                  onClick={() => void startUpload(item)}
                  disabled={item.status === 'uploading' || item.status === 'completed'}
                >
                  {item.status === 'failed' ? 'Retry' : 'Start'}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void cancelItem(item)}
                  disabled={item.status === 'completed' || item.status === 'cancelled'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void removeItem(item)}
                  disabled={item.status === 'uploading' || item.status === 'completed'}
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export default App
