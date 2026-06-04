import { formatDuration } from '../formatDuration'

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45')
  })

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05')
  })

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatDuration(61)).toBe('1:01')
  })

  it('represents hours as a large minute count', () => {
    expect(formatDuration(3661)).toBe('61:01')
  })
})
