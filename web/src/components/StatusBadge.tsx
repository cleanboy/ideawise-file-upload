import type { UploadStatus } from '../types/uploads'

type StatusBadgeProps = {
  status: UploadStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status status--${status}`}>{status}</span>
}
