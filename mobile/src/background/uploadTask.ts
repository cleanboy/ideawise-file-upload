import * as BackgroundTask from 'expo-background-task'
import * as FileSystem from 'expo-file-system/legacy'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { finalizeUpload, getUploadStatus, initiateUpload, uploadChunk } from '../api/uploads'
import type { UploadItem } from '../types/uploads'
import { writeChunkToTemp } from '../utils/fileChunk'
import { loadQueue, persistQueue } from '../utils/uploadQueue'

export const BACKGROUND_UPLOAD_TASK = 'BACKGROUND_UPLOAD_CHECK'

const CHUNK_SIZE = 1024 * 1024

TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const queue = await loadQueue()
    const pending = queue.filter((u) => u.status === 'queued' || u.status === 'paused')

    if (pending.length === 0) return BackgroundTask.BackgroundTaskResult.Success

    const results = await Promise.allSettled(pending.map(backgroundUploadFile))

    const updated = queue.map((item) => {
      const idx = pending.findIndex((p) => p.id === item.id)
      if (idx === -1) return item
      const result = results[idx]
      if (result.status === 'fulfilled') {
        void notifyComplete(item.file.name)
        return { ...item, status: 'completed' as const, progress: 100 }
      }
      return {
        ...item,
        status: 'failed' as const,
        error: (result as PromiseRejectedResult).reason?.message ?? 'Background upload failed',
      }
    })

    await persistQueue(updated)
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

async function backgroundUploadFile(item: UploadItem): Promise<void> {
  const hasResumableSession =
    item.session &&
    item.session.status !== 'failed' &&
    item.session.status !== 'cancelled'

  const session = hasResumableSession
    ? await getUploadStatus(item.session!.uploadId)
    : await initiateUpload(item.file.name, item.file.type, item.file.size, CHUNK_SIZE)

  const uploaded = new Set(session.uploadedChunks)

  for (let i = 0; i < session.totalChunks; i++) {
    if (uploaded.has(i)) continue
    const start = i * session.chunkSize
    const length = Math.min(session.chunkSize, item.file.size - start)
    const tempUri = await writeChunkToTemp(item.file.uri, start, length)
    try {
      await uploadChunk(session.uploadId, i, tempUri)
    } finally {
      await FileSystem.deleteAsync(tempUri, { idempotent: true })
    }
  }

  await finalizeUpload(session.uploadId)
}

async function notifyComplete(filename: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Upload complete', body: `${filename} uploaded successfully.` },
      trigger: null,
    })
  } catch {
    // notifications unavailable
  }
}

export async function registerBackgroundUploadTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync()
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return
    await BackgroundTask.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
      minimumInterval: 60,
      stopOnTerminate: false,
      startOnBoot: true,
    })
  } catch {
    // Background tasks not available (Expo Go, simulator, restricted device)
  }
}

export async function unregisterBackgroundUploadTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_UPLOAD_TASK)
  } catch {
    // Already unregistered
  }
}
