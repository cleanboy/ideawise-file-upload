import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UploadItem } from '../types/uploads'

const QUEUE_KEY = 'upload-queue'

const RESTORABLE = new Set(['queued', 'uploading', 'paused', 'failed'])

export async function persistQueue(items: UploadItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items.filter((u) => RESTORABLE.has(u.status))),
    )
  } catch {
    // storage unavailable
  }
}

export async function loadQueue(): Promise<UploadItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const items = JSON.parse(raw) as UploadItem[]
    // Items that were mid-upload when the app closed should resume from paused
    return items.map((item) =>
      item.status === 'uploading' ? { ...item, status: 'paused' as const } : item,
    )
  } catch {
    return []
  }
}
