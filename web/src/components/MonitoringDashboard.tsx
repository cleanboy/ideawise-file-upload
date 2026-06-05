import type { MonitoringMetrics } from '../types/monitoring'
import { formatBytes } from '../utils/formatBytes'

type Props = {
  metrics: MonitoringMetrics | null
  connected: boolean
  error: string | null
}

export function MonitoringDashboard({ metrics, connected, error }: Props) {
  return (
    <section className="monitoring">
      <div className="monitoring__header">
        <p className="eyebrow">Real-Time Monitoring</p>
        <span className={`monitoring__status ${connected ? 'monitoring__status--live' : ''}`}>
          <span className="monitoring__dot" />
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {error && <p className="monitoring__error">{error}</p>}

      <div className="monitoring__panels">
        <ActiveUploadsPanel metrics={metrics} />
        <SuccessRatePanel metrics={metrics} />
        <SystemLoadPanel metrics={metrics} />
      </div>

      {metrics && (
        <p className="monitoring__timestamp">
          Updated {new Date(metrics.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </section>
  )
}

function ActiveUploadsPanel({ metrics }: { metrics: MonitoringMetrics | null }) {
  const count = metrics?.activeUploads.count ?? 0
  const sessions = metrics?.activeUploads.sessions ?? []

  return (
    <div className="mon-panel">
      <h3 className="mon-panel__title">Active Uploads</h3>
      <p className="mon-panel__stat">{count}</p>
      <p className="mon-panel__label">in progress</p>

      {sessions.length > 0 && (
        <ul className="mon-session-list">
          {sessions.map((s) => (
            <li key={s.uploadId} className="mon-session">
              <div className="mon-session__name">{s.filename}</div>
              <div className="mon-session__meta">
                {formatBytes(s.fileSize)} &middot; {s.progress.toFixed(0)}%
              </div>
              <div className="mon-progress">
                <div className="mon-progress__bar" style={{ width: `${s.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SuccessRatePanel({ metrics }: { metrics: MonitoringMetrics | null }) {
  const { completed = 0, failed = 0, rate = null, throughputBytes = 0 } =
    metrics?.successRate ?? {}

  return (
    <div className="mon-panel">
      <h3 className="mon-panel__title">Success Rate</h3>
      <p className="mon-panel__stat">
        {rate !== null ? `${rate}%` : '—'}
      </p>
      <p className="mon-panel__label">last 24 hours</p>

      <dl className="mon-dl">
        <div className="mon-dl__row">
          <dt>Completed</dt>
          <dd className="mon-dl__value--success">{completed}</dd>
        </div>
        <div className="mon-dl__row">
          <dt>Failed</dt>
          <dd className="mon-dl__value--fail">{failed}</dd>
        </div>
        <div className="mon-dl__row">
          <dt>Throughput</dt>
          <dd>{formatBytes(throughputBytes)}</dd>
        </div>
      </dl>
    </div>
  )
}

function SystemLoadPanel({ metrics }: { metrics: MonitoringMetrics | null }) {
  const { loadAvg1m, loadAvg5m, loadAvg15m, memoryUsedBytes = 0, memoryPeakBytes = 0 } =
    metrics?.systemLoad ?? {}

  const memPercent =
    memoryPeakBytes > 0 ? Math.round((memoryUsedBytes / memoryPeakBytes) * 100) : 0

  function fmt(v: number | null | undefined) {
    return v != null ? v.toFixed(2) : '—'
  }

  return (
    <div className="mon-panel">
      <h3 className="mon-panel__title">System Load</h3>
      <p className="mon-panel__stat">{fmt(loadAvg1m)}</p>
      <p className="mon-panel__label">load avg (1 min)</p>

      <dl className="mon-dl">
        <div className="mon-dl__row">
          <dt>5 min</dt>
          <dd>{fmt(loadAvg5m)}</dd>
        </div>
        <div className="mon-dl__row">
          <dt>15 min</dt>
          <dd>{fmt(loadAvg15m)}</dd>
        </div>
      </dl>

      <div className="mon-mem">
        <div className="mon-mem__labels">
          <span>PHP memory</span>
          <span>{formatBytes(memoryUsedBytes)} / {formatBytes(memoryPeakBytes)} peak</span>
        </div>
        <div className="mon-progress">
          <div className="mon-progress__bar" style={{ width: `${memPercent}%` }} />
        </div>
      </div>
    </div>
  )
}
