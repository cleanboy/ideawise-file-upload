import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearHistory,
  loadHistory,
  saveHistoryEntry,
  type HistoryEntry,
} from './uploadHistory'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'entry-1',
    name: 'photo.jpg',
    size: 1024,
    type: 'image/jpeg',
    status: 'completed',
    savedAt: 1_000_000,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('loadHistory', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadHistory()).toEqual([])
  })

  it('returns stored entries', () => {
    const entry = makeEntry()
    localStorage.setItem('upload-history', JSON.stringify([entry]))
    expect(loadHistory()).toEqual([entry])
  })

  it('returns an empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem('upload-history', 'not-json')
    expect(loadHistory()).toEqual([])
  })
})

describe('saveHistoryEntry', () => {
  it('persists an entry that can be loaded back', () => {
    const entry = makeEntry()
    saveHistoryEntry(entry)
    expect(loadHistory()).toEqual([entry])
  })

  it('prepends new entries so the most recent is first', () => {
    saveHistoryEntry(makeEntry({ id: 'a', savedAt: 1 }))
    saveHistoryEntry(makeEntry({ id: 'b', savedAt: 2 }))
    const [first, second] = loadHistory()
    expect(first.id).toBe('b')
    expect(second.id).toBe('a')
  })

  it('replaces an existing entry with the same id rather than duplicating', () => {
    saveHistoryEntry(makeEntry({ id: 'x', status: 'failed' }))
    saveHistoryEntry(makeEntry({ id: 'x', status: 'completed' }))
    const history = loadHistory()
    expect(history).toHaveLength(1)
    expect(history[0].status).toBe('completed')
  })

  it('caps the list at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      saveHistoryEntry(makeEntry({ id: `entry-${i}` }))
    }
    expect(loadHistory()).toHaveLength(100)
  })
})

describe('clearHistory', () => {
  it('removes all stored entries', () => {
    saveHistoryEntry(makeEntry())
    clearHistory()
    expect(loadHistory()).toEqual([])
  })
})
