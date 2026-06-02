import './App.css'
import { useState } from 'react'
import { DropZone } from './components/DropZone'
import { UploadList } from './components/UploadList'
import { useUploads } from './hooks/useUploads'

const STARTABLE = new Set(['queued', 'paused', 'failed'])

function App() {
  const { cancelItem, pauseItem, queueFiles, removeItem, startUpload, uploads } = useUploads()
  const [selectedIds, setSelectedIds] = useState(new Set<string>())

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
      </section>

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
