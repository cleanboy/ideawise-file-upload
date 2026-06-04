import { STARTABLE, CANCELLABLE, isTerminal } from '../uploadStatus'

describe('STARTABLE', () => {
  it('includes queued, paused, and failed', () => {
    expect(STARTABLE.has('queued')).toBe(true)
    expect(STARTABLE.has('paused')).toBe(true)
    expect(STARTABLE.has('failed')).toBe(true)
  })

  it('excludes uploading, completed, cancelled, and rejected', () => {
    expect(STARTABLE.has('uploading')).toBe(false)
    expect(STARTABLE.has('completed')).toBe(false)
    expect(STARTABLE.has('cancelled')).toBe(false)
    expect(STARTABLE.has('rejected')).toBe(false)
  })
})

describe('CANCELLABLE', () => {
  it('includes queued, uploading, and paused', () => {
    expect(CANCELLABLE.has('queued')).toBe(true)
    expect(CANCELLABLE.has('uploading')).toBe(true)
    expect(CANCELLABLE.has('paused')).toBe(true)
  })

  it('excludes completed, cancelled, failed, and rejected', () => {
    expect(CANCELLABLE.has('completed')).toBe(false)
    expect(CANCELLABLE.has('cancelled')).toBe(false)
    expect(CANCELLABLE.has('failed')).toBe(false)
    expect(CANCELLABLE.has('rejected')).toBe(false)
  })
})

describe('isTerminal', () => {
  it.each(['completed', 'cancelled', 'failed'])('returns true for %s', (status) => {
    expect(isTerminal(status)).toBe(true)
  })

  it.each(['queued', 'uploading', 'paused', 'rejected'])('returns false for %s', (status) => {
    expect(isTerminal(status)).toBe(false)
  })
})
