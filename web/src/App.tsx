import './App.css'
import { useEffect, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { HistoryModal } from './components/HistoryModal'
import { UploadList } from './components/UploadList'
import { useUploadHistory } from './hooks/useUploadHistory'
import { useUploads } from './hooks/useUploads'

const STARTABLE = new Set(['queued', 'paused', 'failed'])
type TerminalStatus = 'completed' | 'cancelled' | 'failed'
const TERMINAL_STATUSES: TerminalStatus[] = ['completed', 'cancelled', 'failed']

function isTerminal(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as string[]).includes(status)
}

function App() {
  const { cancelItem, pauseItem, queueFiles, removeItem, startUpload, uploads } = useUploads()
  const [selectedIds, setSelectedIds] = useState(new Set<string>())
  const { history, addEntry, clear: clearHistory } = useUploadHistory()
  const historyDialogRef = useRef<HTMLDialogElement>(null)
  const savedToHistory = useRef(new Set<string>())

  useEffect(() => {
    uploads.forEach((item) => {
      if (savedToHistory.current.has(item.id)) return
      if (!isTerminal(item.status)) return
      savedToHistory.current.add(item.id)
      addEntry({
        id: item.id,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        status: item.status,
        uploadId: item.session?.uploadId,
        savedAt: Date.now(),
        error: item.error,
      })
    })
  }, [uploads, addEntry])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === uploads.length && uploads.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(uploads.map((u) => u.id)))
    }
  }

  function startSelected() {
    uploads
      .filter((u) => selectedIds.has(u.id) && STARTABLE.has(u.status))
      .forEach((u) => void startUpload(u))
  }

  const startableSelected = uploads.some((u) => selectedIds.has(u.id) && STARTABLE.has(u.status))

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

        <DropZone onFilesSelected={queueFiles} />

        <button
          className="history-trigger button-secondary"
          onClick={() => historyDialogRef.current?.showModal()}
        >
          History
          {history.length > 0 && (
            <span className="history-trigger__badge">{history.length}</span>
          )}
        </button>
      </section>

      <HistoryModal
        dialogRef={historyDialogRef}
        entries={history}
        onClear={clearHistory}
      />

      <UploadList
        uploads={uploads}
        selectedIds={selectedIds}
        startableSelected={startableSelected}
        onCancel={(item) => void cancelItem(item)}
        onPause={(item) => pauseItem(item)}
        onRemove={(item) => void removeItem(item)}
        onStart={(item) => void startUpload(item)}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onStartSelected={startSelected}
      />
    </main>
  )
}

export default App
