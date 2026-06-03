import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { loadHistory } from '../utils/uploadHistory'

export const BACKGROUND_UPLOAD_TASK = 'BACKGROUND_UPLOAD_CHECK'

// Defines the task once at module load time (must be called outside of React components).
TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const history = await loadHistory()
    const hasPending = history.some((e) => e.status !== 'completed' && e.status !== 'cancelled')
    return hasPending
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

export async function registerBackgroundUploadTask(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
      minimumInterval: 60,   // iOS: minimum interval in seconds
      stopOnTerminate: false, // Android: keep running after app close
      startOnBoot: true,      // Android: start on device boot
    })
  } catch {
    // Background fetch not available (simulator, restricted device, etc.)
  }
}

export async function unregisterBackgroundUploadTask(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_UPLOAD_TASK)
  } catch {
    // Already unregistered
  }
}
