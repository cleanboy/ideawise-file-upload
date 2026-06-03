import { useCallback, useState } from 'react'
import {
  clearHistory,
  loadHistory,
  saveHistoryEntry,
  type HistoryEntry,
} from '../utils/uploadHistory'

export function useUploadHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())

  const addEntry = useCallback((entry: HistoryEntry) => {
    saveHistoryEntry(entry)
    setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 100))
  }, [])

  const clear = useCallback(() => {
    clearHistory()
    setHistory([])
  }, [])

  return { history, addEntry, clear }
}
