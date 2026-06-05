import { useCallback, useRef } from 'react'
import type { UploadItem } from '../types/uploads'

export function useNotifications() {
  const notifiedIds = useRef(new Set<string>())

  // Call this from a user-gesture handler (file drop, file picker). Browsers
  // require a gesture to show the permission prompt; calling on page load silently
  // no-ops in most browsers.
  const requestPermission = useCallback(async (): Promise<void> => {
    const NotificationAPI = window.Notification as typeof Notification | undefined
    if (!NotificationAPI) return
    if (NotificationAPI.permission === 'default') {
      await NotificationAPI.requestPermission()
    }
  }, [])

  const notifyCompleted = useCallback((item: UploadItem): void => {
    const NotificationAPI = window.Notification as typeof Notification | undefined
    if (!NotificationAPI) return
    if (NotificationAPI.permission !== 'granted') return
    if (notifiedIds.current.has(item.id)) return

    notifiedIds.current.add(item.id)

    const n = new NotificationAPI('Upload complete', {
      body: item.file.name,
      icon: '/favicon.ico',
    })

    n.onclick = () => window.focus()
  }, [])

  return { requestPermission, notifyCompleted }
}
