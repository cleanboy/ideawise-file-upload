import AsyncStorage from '@react-native-async-storage/async-storage'

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

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    const existing = await loadHistory()
    const updated = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // storage unavailable
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
