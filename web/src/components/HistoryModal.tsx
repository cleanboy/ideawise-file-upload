import type { RefObject } from 'react'
import type { HistoryEntry } from '../utils/uploadHistory'
import { formatBytes } from '../utils/formatBytes'
import { formatTimeAgo } from '../utils/formatTimeAgo'

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>
  entries: HistoryEntry[]
  onClear: () => void
}

const STATUS_LABEL: Record<HistoryEntry['status'], string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function HistoryModal({ dialogRef, entries, onClear }: Props) {
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) dialogRef.current?.close()
  }

  return (
    <dialog ref={dialogRef} className="history-modal" onClick={handleBackdropClick}>
      <div className="history-modal__content">
        <div className="history-modal__header">
          <h2 className="history-modal__title">Upload History</h2>
          <button
            className="history-modal__close button-secondary"
            aria-label="Close history"
            onClick={() => dialogRef.current?.close()}
          >
            ✕
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="history-modal__empty">No upload history yet.</p>
        ) : (
          <ul className="history-list" role="list">
            {entries.map((entry) => (
              <li key={entry.id} className="history-entry">
                <div className="history-entry__row">
                  <span className="history-entry__name" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className={`status status--${entry.status}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                </div>
                <div className="history-entry__meta">
                  <span>{formatBytes(entry.size)}</span>
                  <span className="history-entry__dot" aria-hidden="true">·</span>
                  <span>{formatTimeAgo(entry.savedAt)}</span>
                </div>
                {entry.error && (
                  <p className="history-entry__error">{entry.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {entries.length > 0 && (
          <div className="history-modal__footer">
            <button className="button-secondary" onClick={onClear}>
              Clear history
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
