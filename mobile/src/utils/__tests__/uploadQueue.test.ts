import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadQueue, persistQueue } from '../uploadQueue'
import type { UploadItem } from '../../types/uploads'

const QUEUE_KEY = 'upload-queue'

function makeItem(id: string, status: UploadItem['status'] = 'queued'): UploadItem {
  return {
    id,
    file: { uri: `file://${id}.jpg`, name: `${id}.jpg`, size: 1024, type: 'image/jpeg' },
    status,
    progress: 0,
    uploadedChunks: 0,
    totalChunks: 1,
  }
}

beforeEach(() => {
  // Reset the in-memory store between tests
  ;(AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__ = {}
  jest.clearAllMocks()
})

describe('persistQueue', () => {
  it('saves restorable items (queued, uploading, paused, failed)', async () => {
    await persistQueue([makeItem('a', 'queued'), makeItem('b', 'paused'), makeItem('c', 'uploading'), makeItem('d', 'failed')])
    const raw = (AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__[QUEUE_KEY]
    const stored = JSON.parse(raw) as UploadItem[]
    expect(stored.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('excludes completed and cancelled items', async () => {
    await persistQueue([makeItem('a', 'completed'), makeItem('b', 'cancelled'), makeItem('c', 'queued')])
    const raw = (AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__[QUEUE_KEY]
    const stored = JSON.parse(raw) as UploadItem[]
    expect(stored.map((i) => i.id)).toEqual(['c'])
  })

  it('persists an empty array when all items are terminal', async () => {
    await persistQueue([makeItem('a', 'completed')])
    const raw = (AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__[QUEUE_KEY]
    expect(JSON.parse(raw)).toEqual([])
  })
})

describe('loadQueue', () => {
  it('returns an empty array when storage is empty', async () => {
    expect(await loadQueue()).toEqual([])
  })

  it('returns previously persisted items', async () => {
    await persistQueue([makeItem('a', 'queued'), makeItem('b', 'paused')])
    const loaded = await loadQueue()
    expect(loaded.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('converts uploading items to paused on load', async () => {
    const store = AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }
    store.__INTERNAL_MOCK_STORAGE__[QUEUE_KEY] = JSON.stringify([makeItem('a', 'uploading')])
    const loaded = await loadQueue()
    expect(loaded[0].status).toBe('paused')
  })

  it('returns an empty array when storage throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'))
    expect(await loadQueue()).toEqual([])
  })
})
