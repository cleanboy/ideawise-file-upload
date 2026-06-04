import { formatBytes } from '../formatBytes'

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats exact bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes with one decimal for values under 10', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('formats megabytes with one decimal for values under 10', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('formats megabytes with no decimal for values 10 and above', () => {
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB')
  })

  it('formats gigabytes with one decimal for values under 10', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })

  it('caps at GB — does not produce a TB unit', () => {
    expect(formatBytes(2000 * 1024 * 1024 * 1024)).toBe('2000 GB')
  })
})
