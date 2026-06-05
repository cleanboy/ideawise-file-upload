import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useMonitoring } from './useMonitoring'
import type { MonitoringMetrics } from '../types/monitoring'

// ─── EventSource mock ─────────────────────────────────────────────────────────

class MockEventSource {
  static last: MockEventSource | null = null

  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor() {
    MockEventSource.last = this
  }

  fireOpen() {
    this.onopen?.()
  }

  fireMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  fireError() {
    this.onerror?.()
  }
}

vi.stubGlobal('EventSource', MockEventSource)

function makeMetrics(overrides?: Partial<MonitoringMetrics>): MonitoringMetrics {
  return {
    activeUploads: { count: 0, sessions: [] },
    successRate: { window: '24h', completed: 5, failed: 1, rate: 83.3, throughputBytes: 1048576 },
    systemLoad: { loadAvg1m: 0.5, loadAvg5m: 0.3, loadAvg15m: 0.2, memoryUsedBytes: 52428800, memoryPeakBytes: 104857600 },
    totals: { completed: 5, failed: 1 },
    generatedAt: '2026-06-05T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  MockEventSource.last = null
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── disabled state ───────────────────────────────────────────────────────────

describe('useMonitoring — disabled', () => {
  it('does not open an EventSource when enabled is false', () => {
    renderHook(() => useMonitoring(false))
    expect(MockEventSource.last).toBeNull()
  })

  it('returns null metrics, false connected, and null error when disabled', () => {
    const { result } = renderHook(() => useMonitoring(false))
    expect(result.current.metrics).toBeNull()
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ─── enabled state ────────────────────────────────────────────────────────────

describe('useMonitoring — enabled', () => {
  it('opens an EventSource when enabled is true', () => {
    renderHook(() => useMonitoring(true))
    expect(MockEventSource.last).not.toBeNull()
  })

  it('sets connected to true when the stream opens', () => {
    const { result } = renderHook(() => useMonitoring(true))

    act(() => { MockEventSource.last!.fireOpen() })

    expect(result.current.connected).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('stores parsed metrics on message', () => {
    const { result } = renderHook(() => useMonitoring(true))
    const metrics = makeMetrics()

    act(() => { MockEventSource.last!.fireMessage(metrics) })

    expect(result.current.metrics).toEqual(metrics)
    expect(result.current.connected).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('sets connected to false and error on stream error', () => {
    const { result } = renderHook(() => useMonitoring(true))

    act(() => { MockEventSource.last!.fireOpen() })
    act(() => { MockEventSource.last!.fireError() })

    expect(result.current.connected).toBe(false)
    expect(result.current.error).toMatch(/disconnected/i)
  })

  it('clears the error when a new message arrives after a reconnect', () => {
    const { result } = renderHook(() => useMonitoring(true))

    act(() => { MockEventSource.last!.fireError() })
    expect(result.current.error).not.toBeNull()

    act(() => { MockEventSource.last!.fireMessage(makeMetrics()) })

    expect(result.current.error).toBeNull()
  })

  it('sets error when the message contains invalid JSON', () => {
    const { result } = renderHook(() => useMonitoring(true))

    act(() => { MockEventSource.last!.onmessage?.({ data: 'not-json{{{' }) })

    expect(result.current.error).toMatch(/parse/i)
  })

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useMonitoring(true))
    const instance = MockEventSource.last!

    unmount()

    expect(instance.close).toHaveBeenCalledOnce()
  })
})

// ─── toggling ─────────────────────────────────────────────────────────────────

describe('useMonitoring — toggling', () => {
  it('resets state and closes the stream when enabled switches to false', () => {
    const { result, rerender } = renderHook(({ enabled }) => useMonitoring(enabled), {
      initialProps: { enabled: true },
    })
    const instance = MockEventSource.last!

    act(() => { instance.fireOpen() })
    act(() => { instance.fireMessage(makeMetrics()) })
    expect(result.current.metrics).not.toBeNull()

    rerender({ enabled: false })

    expect(result.current.metrics).toBeNull()
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBeNull()
    expect(instance.close).toHaveBeenCalledOnce()
  })

  it('opens a new EventSource when enabled switches back to true', () => {
    const { rerender } = renderHook(({ enabled }) => useMonitoring(enabled), {
      initialProps: { enabled: false },
    })

    rerender({ enabled: true })

    expect(MockEventSource.last).not.toBeNull()
  })
})
