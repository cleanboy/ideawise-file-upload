import type { UploadItem } from '../types/uploads'
import { UploadCard } from './UploadCard'

type UploadListProps = {
  uploads: UploadItem[]
  onCancel: (item: UploadItem) => void
  onPause: (item: UploadItem) => void
  onRemove: (item: UploadItem) => void
  onStart: (item: UploadItem) => void
}

export function UploadList({ uploads, onCancel, onPause, onRemove, onStart }: UploadListProps) {
  return (
    <section className="upload-list" aria-label="Queued uploads">
      {uploads.length === 0 ? (
        <div className="empty-state">No files queued.</div>
      ) : (
        uploads.map((item) => (
          <UploadCard
            item={item}
            key={item.id}
            onCancel={onCancel}
            onPause={onPause}
            onRemove={onRemove}
            onStart={onStart}
          />
        ))
      )}
    </section>
  )
}
