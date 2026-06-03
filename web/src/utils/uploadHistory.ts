const STORAGE_KEY = 'upload-history'
const MAX_ENTRIES = 100

export type HistoryEntry = {
  id: string
  name: string
  size: number
  type: string
  status: 'completed' | 'cancelled' | 'failed'
  uploadId?: string
  savedAt: number
  error?: string
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  try {
    const existing = loadHistory()
    const updated = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage unavailable (e.g. private browsing with storage disabled)
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
