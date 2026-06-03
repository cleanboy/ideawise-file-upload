import { describe, it, expect } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes without a decimal', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats exactly 1 KB with one decimal (value < 10)', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('formats KB with one decimal when value < 10', () => {
    expect(formatBytes(1024 * 1.5)).toBe('1.5 KB')
  })

  it('formats KB without decimal when value >= 10', () => {
    expect(formatBytes(1024 * 12)).toBe('12 KB')
  })

  it('formats exactly 1 MB with one decimal (value < 10)', () => {
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB')
  })

  it('formats MB with one decimal when value < 10', () => {
    expect(formatBytes(1024 ** 2 * 2.5)).toBe('2.5 MB')
  })

  it('formats exactly 1 GB with one decimal (value < 10)', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })

  it('caps at GB and does not go to TB', () => {
    expect(formatBytes(1024 ** 4)).toBe('1024 GB')
  })

  it('formats large GB value without decimal', () => {
    expect(formatBytes(1024 ** 3 * 50)).toBe('50 GB')
  })
})
