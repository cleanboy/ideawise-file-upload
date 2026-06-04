import { useState } from 'react'
import type { UploadItem } from '../types/uploads'
import { STARTABLE } from '../utils/uploadStatus'

export function useSelection(uploads: UploadItem[]) {
  const [selectedIds, setSelectedIds] = useState(new Set<string>())

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === uploads.length && uploads.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(uploads.map((u) => u.id)))
    }
  }

  const startableSelected = uploads.some((u) => selectedIds.has(u.id) && STARTABLE.has(u.status))

  return { selectedIds, toggleSelect, toggleSelectAll, startableSelected }
}
