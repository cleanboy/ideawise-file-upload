import { formatTimeAgo } from '../formatTimeAgo'

describe('formatTimeAgo', () => {
  const now = 1_000_000_000_000 // fixed reference point

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns "just now" for a timestamp less than 1 minute ago', () => {
    expect(formatTimeAgo(now - 30_000)).toBe('just now')
  })

  it('returns "just now" at the 59,999 ms boundary', () => {
    expect(formatTimeAgo(now - 59_999)).toBe('just now')
  })

  it('returns minutes for 1–59 minutes ago', () => {
    expect(formatTimeAgo(now - 5 * 60_000)).toBe('5m ago')
  })

  it('returns hours for 1–23 hours ago', () => {
    expect(formatTimeAgo(now - 3 * 3_600_000)).toBe('3h ago')
  })

  it('returns days for 24+ hours ago', () => {
    expect(formatTimeAgo(now - 2 * 86_400_000)).toBe('2d ago')
  })
})
