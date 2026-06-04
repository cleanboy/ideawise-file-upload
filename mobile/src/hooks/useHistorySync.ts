import { useEffect, useRef } from 'react'
import type { HistoryEntry } from '../utils/uploadHistory'
import type { UploadItem } from '../types/uploads'
import { isTerminal } from '../utils/uploadStatus'

export function useHistorySync(
  uploads: UploadItem[],
  addEntry: (entry: HistoryEntry) => void,
) {
  const savedToHistory = useRef(new Set<string>())

  useEffect(() => {
    uploads.forEach((item) => {
      if (savedToHistory.current.has(item.id)) return
      if (!isTerminal(item.status)) return
      savedToHistory.current.add(item.id)
      addEntry({
        id: item.id,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        status: item.status,
        uploadId: item.session?.uploadId,
        savedAt: Date.now(),
        error: item.error,
      })
    })
  }, [uploads, addEntry])
}
