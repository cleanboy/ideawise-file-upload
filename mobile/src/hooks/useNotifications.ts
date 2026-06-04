import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export function useNotifications() {
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {})
  }, [])
}

export async function notifyUploadComplete(filename: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Upload complete',
        body: `${filename} uploaded successfully.`,
      },
      trigger: null,
    })
  } catch {
    // notifications unavailable (Expo Go, permissions denied, etc.)
  }
}
