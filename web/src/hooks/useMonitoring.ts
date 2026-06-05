import { useEffect, useState } from 'react'
import { MONITORING_STREAM_URL } from '../api/monitoring'
import type { MonitoringMetrics } from '../types/monitoring'

export function useMonitoring(enabled: boolean) {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setMetrics(null)
      setConnected(false)
      setError(null)
      return
    }

    const es = new EventSource(MONITORING_STREAM_URL)

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        setMetrics(JSON.parse(event.data) as MonitoringMetrics)
        setConnected(true)
        setError(null)
      } catch {
        setError('Failed to parse server metrics.')
      }
    }

    es.onerror = () => {
      setConnected(false)
      setError('Stream disconnected. Reconnecting…')
    }

    return () => es.close()
  }, [enabled])

  return { metrics, connected, error }
}
