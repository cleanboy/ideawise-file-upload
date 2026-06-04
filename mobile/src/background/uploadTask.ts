import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { loadHistory } from '../utils/uploadHistory'

export const BACKGROUND_UPLOAD_TASK = 'BACKGROUND_UPLOAD_CHECK'

TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const history = await loadHistory()
    const hasPending = history.some((e) => e.status !== 'completed' && e.status !== 'cancelled')
    return hasPending
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

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
    // Background tasks not available (Expo Go, simulator, restricted device, etc.)
  }
}

export async function unregisterBackgroundUploadTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_UPLOAD_TASK)
  } catch {
    // Already unregistered
  }
}
