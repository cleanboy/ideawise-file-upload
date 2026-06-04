import type { UploadStatus } from '../types/uploads'

export const STARTABLE = new Set<UploadStatus>(['queued', 'paused', 'failed'])

type TerminalStatus = 'completed' | 'cancelled' | 'failed'
const TERMINAL: TerminalStatus[] = ['completed', 'cancelled', 'failed']

export function isTerminal(status: string): status is TerminalStatus {
  return (TERMINAL as string[]).includes(status)
}
