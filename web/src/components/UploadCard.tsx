import type { UploadItem } from '../types/uploads'
import { formatBytes } from '../utils/formatBytes'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

type UploadCardProps = {
  item: UploadItem
  onCancel: (item: UploadItem) => void
  onRemove: (item: UploadItem) => void
  onStart: (item: UploadItem) => void
}

export function UploadCard({ item, onCancel, onRemove, onStart }: UploadCardProps) {
  return (
    <article className="upload-card">
      <div className="upload-card__header">
        <div>
          <h2>{item.file.name}</h2>
          <p>
            {formatBytes(item.file.size)} · {item.uploadedChunks}/{item.totalChunks} chunks
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <ProgressBar label={`${item.file.name} progress`} value={item.progress} />

      {item.error ? <p className="error-message">{item.error}</p> : null}

      <div className="actions">
        <button
          type="button"
          onClick={() => onStart(item)}
          disabled={item.status === 'uploading' || item.status === 'completed'}
        >
          {item.status === 'failed' ? 'Retry' : 'Start'}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => onCancel(item)}
          disabled={item.status === 'completed' || item.status === 'cancelled'}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => onRemove(item)}
          disabled={item.status === 'uploading' || item.status === 'completed'}
        >
          Remove
        </button>
      </div>
    </article>
  )
}
