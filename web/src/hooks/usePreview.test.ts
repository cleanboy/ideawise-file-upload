import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePreview } from './usePreview'

function makeFile(name: string, type: string) {
  return new File([''], name, { type })
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── image branch ─────────────────────────────────────────────────────────────

describe('usePreview — image', () => {
  let mockImg: {
    naturalWidth: number
    naturalHeight: number
    onload: (() => void) | null
    onerror: (() => void) | null
  }

  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 800
        naturalHeight = 600
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_val: string) {
          mockImg = this as never
        }
      },
    )
  })

  it('returns null before the image loads', () => {
    const { result } = renderHook(() => usePreview(makeFile('photo.jpg', 'image/jpeg')))
    expect(result.current).toBeNull()
  })

  it('sets url, width, and height after the image loads', () => {
    const { result } = renderHook(() => usePreview(makeFile('photo.jpg', 'image/jpeg')))
    act(() => {
      mockImg.onload?.()
    })
    expect(result.current).toEqual({ url: 'blob:mock-url', width: 800, height: 600 })
  })

  it('sets only url when the image errors', () => {
    const { result } = renderHook(() => usePreview(makeFile('photo.jpg', 'image/jpeg')))
    act(() => {
      mockImg.onerror?.()
    })
    expect(result.current).toEqual({ url: 'blob:mock-url' })
  })

  it('revokes the object URL on unmount', () => {
    const { unmount } = renderHook(() => usePreview(makeFile('photo.jpg', 'image/jpeg')))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('calls createObjectURL with the file', () => {
    const file = makeFile('photo.jpg', 'image/jpeg')
    renderHook(() => usePreview(file))
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })
})

// ─── video branch ─────────────────────────────────────────────────────────────

describe('usePreview — video', () => {
  let mockVideoEl: {
    preload: string
    videoWidth: number
    videoHeight: number
    duration: number
    src: string
    onloadedmetadata: (() => void) | null
    onerror: (() => void) | null
  }

  beforeEach(() => {
    mockVideoEl = {
      preload: '',
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 120.5,
      src: '',
      onloadedmetadata: null,
      onerror: null,
    }

    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, ...args) => {
      if (tag === 'video') return mockVideoEl as unknown as HTMLElement
      return orig(tag, ...(args as [ElementCreationOptions?]))
    })
  })

  it('sets url, width, height, and duration after metadata loads', () => {
    const { result } = renderHook(() => usePreview(makeFile('clip.mp4', 'video/mp4')))
    act(() => {
      mockVideoEl.onloadedmetadata?.()
    })
    expect(result.current).toEqual({
      url: 'blob:mock-url',
      width: 1920,
      height: 1080,
      duration: 120.5,
    })
  })

  it('sets only url when the video errors', () => {
    const { result } = renderHook(() => usePreview(makeFile('clip.mp4', 'video/mp4')))
    act(() => {
      mockVideoEl.onerror?.()
    })
    expect(result.current).toEqual({ url: 'blob:mock-url' })
  })

  it('sets preload to "metadata"', () => {
    renderHook(() => usePreview(makeFile('clip.mp4', 'video/mp4')))
    expect(mockVideoEl.preload).toBe('metadata')
  })
})
