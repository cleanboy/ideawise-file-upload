import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadHistory, saveHistoryEntry, clearHistory, type HistoryEntry } from '../uploadHistory'

const STORAGE_KEY = 'upload-history'

function makeEntry(id: string, status: HistoryEntry['status'] = 'completed'): HistoryEntry {
  return { id, name: `${id}.jpg`, size: 1024, type: 'image/jpeg', status, savedAt: 1000 }
}

type MockStorage = { __INTERNAL_MOCK_STORAGE__: Record<string, string> }

function getStore(): Record<string, string> {
  return (AsyncStorage as unknown as MockStorage).__INTERNAL_MOCK_STORAGE__
}

beforeEach(() => {
  (AsyncStorage as unknown as MockStorage).__INTERNAL_MOCK_STORAGE__ = {}
  jest.clearAllMocks()
})

describe('loadHistory', () => {
  it('returns an empty array when storage is empty', async () => {
    expect(await loadHistory()).toEqual([])
  })

  it('returns stored entries', async () => {
    getStore()[STORAGE_KEY] = JSON.stringify([makeEntry('a')])
    const result = await loadHistory()
    expect(result[0].id).toBe('a')
  })

  it('returns an empty array when storage throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'))
    expect(await loadHistory()).toEqual([])
  })
})

describe('saveHistoryEntry', () => {
  it('saves a new entry', async () => {
    await saveHistoryEntry(makeEntry('a'))
    const stored = JSON.parse(getStore()[STORAGE_KEY]) as HistoryEntry[]
    expect(stored[0].id).toBe('a')
  })

  it('prepends newer entries before older ones', async () => {
    await saveHistoryEntry(makeEntry('a'))
    await saveHistoryEntry(makeEntry('b'))
    const stored = JSON.parse(getStore()[STORAGE_KEY]) as HistoryEntry[]
    expect(stored.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('deduplicates: re-saving an entry replaces the existing one', async () => {
    await saveHistoryEntry({ ...makeEntry('a'), status: 'completed' })
    await saveHistoryEntry({ ...makeEntry('a'), status: 'failed' })
    const stored = JSON.parse(getStore()[STORAGE_KEY]) as HistoryEntry[]
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe('failed')
  })
})

describe('clearHistory', () => {
  it('removes all entries from storage', async () => {
    await saveHistoryEntry(makeEntry('a'))
    await clearHistory()
    expect(await loadHistory()).toEqual([])
  })
})
