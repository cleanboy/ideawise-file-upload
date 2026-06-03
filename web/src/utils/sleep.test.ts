import { describe, it, expect, vi, afterEach } from 'vitest'
import { sleep } from './sleep'

afterEach(() => {
  vi.useRealTimers()
})

describe('sleep', () => {
  it('resolves after the specified delay', async () => {
    vi.useFakeTimers()
    const promise = sleep(100)
    vi.advanceTimersByTime(100)
    await expect(promise).resolves.toBeUndefined()
  })

  it('does not resolve before the delay elapses', async () => {
    vi.useFakeTimers()
    let resolved = false
    sleep(500).then(() => {
      resolved = true
    })
    vi.advanceTimersByTime(499)
    await Promise.resolve()
    expect(resolved).toBe(false)
  })
})
