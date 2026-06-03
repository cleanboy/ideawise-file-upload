import { useCallback, useEffect, useState } from 'react'
import {
  clearHistory,
  loadHistory,
  saveHistoryEntry,
  type HistoryEntry,
} from '../utils/uploadHistory'

export function useUploadHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void loadHistory().then(setHistory)
  }, [])

  const addEntry = useCallback((entry: HistoryEntry) => {
    void saveHistoryEntry(entry)
    setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 100))
  }, [])

  const clear = useCallback(() => {
    void clearHistory()
    setHistory([])
  }, [])

  return { history, addEntry, clear }
}
