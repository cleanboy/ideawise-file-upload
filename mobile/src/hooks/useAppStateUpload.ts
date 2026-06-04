import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import type { UploadItem } from '../types/uploads'

type Props = {
  uploads: UploadItem[]
  startUpload: (item: UploadItem) => Promise<void>
}

export function useAppStateUpload({ uploads, startUpload }: Props) {
  const appState = useRef<AppStateStatus>(AppState.currentState)
  // Keep a ref so the AppState listener always sees the latest uploads
  // without needing to re-subscribe on every render
  const uploadsRef = useRef(uploads)
  uploadsRef.current = uploads

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current
      appState.current = next

      // Resume any paused uploads when returning to foreground (handles OS-killed sessions)
      if (prev.match(/inactive|background/) && next === 'active') {
        uploadsRef.current
          .filter((u) => u.status === 'paused')
          .forEach((u) => void startUpload(u))
      }
    })

    return () => sub.remove()
  }, [startUpload])
}
