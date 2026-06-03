import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatTimeAgo } from './formatTimeAgo'

const NOW = new Date('2026-06-03T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatTimeAgo', () => {
  it('returns "just now" for timestamps less than a minute ago', () => {
    expect(formatTimeAgo(NOW - 30_000)).toBe('just now')
  })

  it('returns minutes for timestamps between 1 minute and 1 hour ago', () => {
    expect(formatTimeAgo(NOW - 5 * 60_000)).toBe('5m ago')
  })

  it('returns hours for timestamps between 1 hour and 1 day ago', () => {
    expect(formatTimeAgo(NOW - 3 * 3_600_000)).toBe('3h ago')
  })

  it('returns days for timestamps more than 1 day ago', () => {
    expect(formatTimeAgo(NOW - 2 * 86_400_000)).toBe('2d ago')
  })
})
