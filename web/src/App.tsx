import './App.css'
import { DropZone } from './components/DropZone'
import { UploadList } from './components/UploadList'
import { useUploads } from './hooks/useUploads'

function App() {
  const { cancelItem, queueFiles, removeItem, startUpload, uploads } = useUploads()

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
        onCancel={(item) => void cancelItem(item)}
        onRemove={(item) => void removeItem(item)}
        onStart={(item) => void startUpload(item)}
      />
    </main>
  )
}

export default App
