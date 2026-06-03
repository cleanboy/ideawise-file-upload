import { describe, it, expect } from 'vitest'
import { formatDuration } from './formatDuration'

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats seconds below one minute', () => {
    expect(formatDuration(45)).toBe('0:45')
  })

  it('pads single-digit seconds', () => {
    expect(formatDuration(9)).toBe('0:09')
  })

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30')
  })

  it('formats multi-digit minutes', () => {
    expect(formatDuration(3661)).toBe('61:01')
  })

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('0:59')
  })
})
