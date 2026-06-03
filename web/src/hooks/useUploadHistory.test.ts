import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useUploadHistory } from './useUploadHistory'
import type { HistoryEntry } from '../utils/uploadHistory'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'e1',
    name: 'photo.jpg',
    size: 2048,
    type: 'image/jpeg',
    status: 'completed',
    savedAt: 1_000_000,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useUploadHistory', () => {
  it('starts with an empty history when localStorage is empty', () => {
    const { result } = renderHook(() => useUploadHistory())
    expect(result.current.history).toEqual([])
  })

  it('loads existing entries from localStorage on mount', () => {
    const entry = makeEntry()
    localStorage.setItem('upload-history', JSON.stringify([entry]))
    const { result } = renderHook(() => useUploadHistory())
    expect(result.current.history).toEqual([entry])
  })

  it('addEntry prepends the new entry and persists it', () => {
    const { result } = renderHook(() => useUploadHistory())
    const entry = makeEntry()
    act(() => { result.current.addEntry(entry) })
    expect(result.current.history).toEqual([entry])
    expect(JSON.parse(localStorage.getItem('upload-history') ?? '[]')).toEqual([entry])
  })

  it('addEntry replaces an existing entry with the same id', () => {
    const { result } = renderHook(() => useUploadHistory())
    act(() => { result.current.addEntry(makeEntry({ status: 'failed' })) })
    act(() => { result.current.addEntry(makeEntry({ status: 'completed' })) })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].status).toBe('completed')
  })

  it('clear empties the history and removes localStorage entry', () => {
    const { result } = renderHook(() => useUploadHistory())
    act(() => { result.current.addEntry(makeEntry()) })
    act(() => { result.current.clear() })
    expect(result.current.history).toEqual([])
    expect(localStorage.getItem('upload-history')).toBeNull()
  })
})
