import { useEffect, useRef } from 'react'
import type { UploadItem } from '../types/uploads'
import { UploadCard } from './UploadCard'

type UploadListProps = {
  uploads: UploadItem[]
  selectedIds: Set<string>
  startableSelected: boolean
  onCancel: (item: UploadItem) => void
  onPause: (item: UploadItem) => void
  onRemove: (item: UploadItem) => void
  onStart: (item: UploadItem) => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onStartSelected: () => void
}

export function UploadList({
  uploads,
  selectedIds,
  startableSelected,
  onCancel,
  onPause,
  onRemove,
  onStart,
  onToggleSelect,
  onToggleSelectAll,
  onStartSelected,
}: UploadListProps) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const allSelected = uploads.length > 0 && selectedIds.size === uploads.length
  const someSelected = selectedIds.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  return (
    <section className="upload-list" aria-label="Queued uploads">
      {uploads.length === 0 ? (
        <div className="empty-state">No files queued.</div>
      ) : (
        <>
          <div className="upload-list__header">
            <label className="select-all">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
              />
              <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
            </label>

            <button type="button" onClick={onStartSelected} disabled={!startableSelected}>
              Start Selected
            </button>
          </div>

          {uploads.map((item) => (
            <UploadCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onCancel={onCancel}
              onPause={onPause}
              onRemove={onRemove}
              onStart={onStart}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </>
      )}
    </section>
  )
}
