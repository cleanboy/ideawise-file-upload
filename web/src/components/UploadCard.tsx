import type { UploadItem } from '../types/uploads'
import { usePreview } from '../hooks/usePreview'
import { formatBytes } from '../utils/formatBytes'
import { formatDuration } from '../utils/formatDuration'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

type UploadCardProps = {
  item: UploadItem
  selected: boolean
  onCancel: (item: UploadItem) => void
  onPause: (item: UploadItem) => void
  onRemove: (item: UploadItem) => void
  onStart: (item: UploadItem) => void
  onToggleSelect: (id: string) => void
}

export function UploadCard({ item, selected, onCancel, onPause, onRemove, onStart, onToggleSelect }: UploadCardProps) {
  const isRejected = item.status === 'rejected'
  const isPreviewable =
    item.file.type.startsWith('image/') || item.file.type.startsWith('video/')
  const preview = usePreview(item.file)

  const ext = item.file.name.split('.').pop()?.toUpperCase()

  return (
    <article className={`upload-card${isRejected ? ' upload-card--rejected' : ''}`}>
      <div className="upload-card__header">
        <input
          type="checkbox"
          className="upload-card__select"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          aria-label={`Select ${item.file.name}`}
        />

        {isPreviewable && (
          <div className="upload-card__thumb">
            {preview && item.file.type.startsWith('image/') && (
              <img src={preview.url} alt="" />
            )}
            {preview && item.file.type.startsWith('video/') && (
              <video src={preview.url} muted playsInline />
            )}
          </div>
        )}

        <div className="upload-card__info">
          <h2>{item.file.name}</h2>
          <dl className="upload-card__meta">
            {ext && <><dt>Type</dt><dd>{ext}</dd></>}
            {preview?.width && preview?.height && (
              <><dt>Resolution</dt><dd>{preview.width} × {preview.height}</dd></>
            )}
            {preview?.duration !== undefined && (
              <><dt>Duration</dt><dd>{formatDuration(preview.duration)}</dd></>
            )}
            <dt>Size</dt><dd>{formatBytes(item.file.size)}</dd>
            {!isRejected && <><dt>Chunks</dt><dd>{item.uploadedChunks} / {item.totalChunks}</dd></>}
          </dl>
        </div>

        <StatusBadge status={item.status} />
      </div>

      {!isRejected && (
        <ProgressBar
          label={`${item.file.name} progress`}
          value={item.pausedProgress ?? item.progress}
        />
      )}

      {item.error ? (
        <p className={isRejected ? 'rejection-reason' : 'error-message'}>{item.error}</p>
      ) : null}

      <div className="actions">
        {item.status !== 'completed' && (
          item.status === 'uploading' ? (
            <button type="button" onClick={() => onPause(item)}>
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart(item)}
              disabled={item.status === 'rejected'}
            >
              {item.status === 'failed' ? 'Retry' : item.status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )
        )}
        {item.status !== 'completed' && (
          <button
            type="button"
            className="button-secondary"
            onClick={() => onCancel(item)}
            disabled={item.status === 'cancelled' || item.status === 'rejected'}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="button-secondary"
          onClick={() => onRemove(item)}
          disabled={item.status === 'uploading'}
        >
          Remove
        </button>
      </div>
    </article>
  )
}
