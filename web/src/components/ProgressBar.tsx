type ProgressBarProps = {
  label: string
  value: number
}

export function ProgressBar({ label, value }: ProgressBarProps) {
  return (
    <div className="progress-bar" aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  )
}
