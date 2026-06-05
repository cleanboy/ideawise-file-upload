import './App.css'
import { useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { HistoryModal } from './components/HistoryModal'
import { MonitoringDashboard } from './components/MonitoringDashboard'
import { UploadList } from './components/UploadList'
import { useHistorySync } from './hooks/useHistorySync'
import { useMonitoring } from './hooks/useMonitoring'
import { useSelection } from './hooks/useSelection'
import { useUploadHistory } from './hooks/useUploadHistory'
import { useUploads } from './hooks/useUploads'
import { STARTABLE } from './utils/uploadStatus'

function App() {
  const { cancelItem, pauseItem, queueFiles, removeItem, startUpload, uploads } = useUploads()
  const { history, addEntry, clear: clearHistory } = useUploadHistory()
  const { selectedIds, toggleSelect, toggleSelectAll, startableSelected } = useSelection(uploads)
  const historyDialogRef = useRef<HTMLDialogElement>(null)
  const [monitoringOpen, setMonitoringOpen] = useState(false)
  const { metrics, connected, error } = useMonitoring(monitoringOpen)

  useHistorySync(uploads, addEntry)

  function startSelected() {
    uploads
      .filter((u) => selectedIds.has(u.id) && STARTABLE.has(u.status))
      .forEach((u) => void startUpload(u))
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

        <DropZone onFilesSelected={queueFiles} />

        <div className="upload-panel__actions">
          <button
            className="history-trigger button-secondary"
            onClick={() => historyDialogRef.current?.showModal()}
          >
            History
            {history.length > 0 && (
              <span className="history-trigger__badge">{history.length}</span>
            )}
          </button>

          <button
            className={`button-secondary ${monitoringOpen ? 'button-secondary--active' : ''}`}
            onClick={() => setMonitoringOpen((o) => !o)}
          >
            {monitoringOpen ? 'Hide monitoring' : 'Monitoring'}
          </button>
        </div>

        {monitoringOpen && (
          <MonitoringDashboard metrics={metrics} connected={connected} error={error} />
        )}
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
