export type ActiveSession = {
  uploadId: string
  filename: string
  progress: number
  fileSize: number
}

export type MonitoringMetrics = {
  activeUploads: {
    count: number
    sessions: ActiveSession[]
  }
  successRate: {
    window: string
    completed: number
    failed: number
    rate: number | null
    throughputBytes: number
  }
  systemLoad: {
    loadAvg1m: number | null
    loadAvg5m: number | null
    loadAvg15m: number | null
    memoryUsedBytes: number
    memoryPeakBytes: number
  }
  totals: Record<string, number>
  generatedAt: string
}
