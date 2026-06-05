import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MonitoringDashboard } from './MonitoringDashboard'
import type { MonitoringMetrics } from '../types/monitoring'

function makeMetrics(overrides?: Partial<MonitoringMetrics>): MonitoringMetrics {
  return {
    activeUploads: { count: 0, sessions: [] },
    successRate: { window: '24h', completed: 8, failed: 2, rate: 80.0, throughputBytes: 5242880 },
    systemLoad: { loadAvg1m: 1.25, loadAvg5m: 0.87, loadAvg15m: 0.54, memoryUsedBytes: 52428800, memoryPeakBytes: 104857600 },
    totals: { completed: 8, failed: 2 },
    generatedAt: new Date('2026-06-05T14:30:00Z').toISOString(),
    ...overrides,
  }
}

// ─── connection status ────────────────────────────────────────────────────────

describe('MonitoringDashboard — connection status', () => {
  it('shows "Connecting…" when not connected', () => {
    render(<MonitoringDashboard metrics={null} connected={false} error={null} />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  it('shows "Live" when connected', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows the error message when error prop is set', () => {
    render(
      <MonitoringDashboard
        metrics={null}
        connected={false}
        error="Stream disconnected. Reconnecting…"
      />,
    )
    expect(screen.getByText('Stream disconnected. Reconnecting…')).toBeInTheDocument()
  })

  it('does not render an error element when error is null', () => {
    const { container } = render(
      <MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />,
    )
    expect(container.querySelector('.monitoring__error')).not.toBeInTheDocument()
  })
})

// ─── active uploads panel ─────────────────────────────────────────────────────

describe('MonitoringDashboard — active uploads panel', () => {
  it('shows 0 when there are no active sessions', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows the active upload count from metrics', () => {
    render(
      <MonitoringDashboard
        metrics={makeMetrics({ activeUploads: { count: 3, sessions: [] } })}
        connected={true}
        error={null}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('lists filenames of active sessions', () => {
    const sessions = [
      { uploadId: 'a', filename: 'video.mp4', progress: 45, fileSize: 10485760 },
      { uploadId: 'b', filename: 'photo.jpg', progress: 80, fileSize: 524288 },
    ]
    render(
      <MonitoringDashboard
        metrics={makeMetrics({ activeUploads: { count: 2, sessions } })}
        connected={true}
        error={null}
      />,
    )
    expect(screen.getByText('video.mp4')).toBeInTheDocument()
    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
  })

  it('shows progress percentage for each active session', () => {
    const sessions = [{ uploadId: 'a', filename: 'clip.mp4', progress: 62, fileSize: 1048576 }]
    render(
      <MonitoringDashboard
        metrics={makeMetrics({ activeUploads: { count: 1, sessions } })}
        connected={true}
        error={null}
      />,
    )
    expect(screen.getByText(/62%/)).toBeInTheDocument()
  })

  it('shows 0 as the count when metrics is null', () => {
    render(<MonitoringDashboard metrics={null} connected={false} error={null} />)
    const panel = screen.getByText('Active Uploads').closest('.mon-panel')!
    expect(within(panel).getByText('0')).toBeInTheDocument()
  })
})

// ─── success rate panel ───────────────────────────────────────────────────────

describe('MonitoringDashboard — success rate panel', () => {
  it('shows "—" when rate is null (no data yet)', () => {
    render(
      <MonitoringDashboard
        metrics={makeMetrics({
          successRate: { window: '24h', completed: 0, failed: 0, rate: null, throughputBytes: 0 },
        })}
        connected={true}
        error={null}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows the rate as a percentage when non-null', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('shows completed and failed counts', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('formats throughput bytes', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('5.0 MB')).toBeInTheDocument()
  })
})

// ─── system load panel ────────────────────────────────────────────────────────

describe('MonitoringDashboard — system load panel', () => {
  it('shows the 1-minute load average as the headline stat', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('1.25')).toBeInTheDocument()
  })

  it('shows 5-minute and 15-minute load averages', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText('0.87')).toBeInTheDocument()
    expect(screen.getByText('0.54')).toBeInTheDocument()
  })

  it('shows "—" for load averages when system data is unavailable', () => {
    render(
      <MonitoringDashboard
        metrics={makeMetrics({
          systemLoad: {
            loadAvg1m: null,
            loadAvg5m: null,
            loadAvg15m: null,
            memoryUsedBytes: 0,
            memoryPeakBytes: 0,
          },
        })}
        connected={true}
        error={null}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('shows formatted memory usage', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText(/50 MB \/ 100 MB peak/)).toBeInTheDocument()
  })
})

// ─── timestamp ────────────────────────────────────────────────────────────────

describe('MonitoringDashboard — timestamp', () => {
  it('shows an "Updated" timestamp when metrics are present', () => {
    render(<MonitoringDashboard metrics={makeMetrics()} connected={true} error={null} />)
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('does not show a timestamp when metrics is null', () => {
    render(<MonitoringDashboard metrics={null} connected={false} error={null} />)
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })
})
