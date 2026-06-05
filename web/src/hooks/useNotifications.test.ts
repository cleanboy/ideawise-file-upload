import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNotifications } from './useNotifications'
import type { UploadItem } from '../types/uploads'

function makeItem(id: string): UploadItem {
  return {
    id,
    file: new File([], `${id}.jpg`, { type: 'image/jpeg' }),
    status: 'completed',
    progress: 100,
    uploadedChunks: 1,
    totalChunks: 1,
  }
}

type NotificationInstance = {
  title: string
  options?: NotificationOptions
  onclick: (() => void) | null
}

function makeNotificationMock(permission: NotificationPermission) {
  const instances: NotificationInstance[] = []
  const requestPermissionMock = vi.fn().mockResolvedValue(permission)

  class NotificationMock {
    title: string
    options?: NotificationOptions
    onclick: (() => void) | null = null

    constructor(title: string, options?: NotificationOptions) {
      this.title = title
      this.options = options
      instances.push(this)
    }

    static get permission() {
      return permission
    }
    static requestPermission = requestPermissionMock
  }

  return {
    Ctor: NotificationMock as unknown as typeof Notification,
    instances,
    requestPermissionMock,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNotifications', () => {
  describe('requestPermission', () => {
    it('calls Notification.requestPermission when permission is default', async () => {
      const { Ctor, requestPermissionMock } = makeNotificationMock('default')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      await act(() => result.current.requestPermission())

      expect(requestPermissionMock).toHaveBeenCalledOnce()
    })

    it('does not call requestPermission when already granted', async () => {
      const { Ctor, requestPermissionMock } = makeNotificationMock('granted')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      await act(() => result.current.requestPermission())

      expect(requestPermissionMock).not.toHaveBeenCalled()
    })

    it('does not call requestPermission when already denied', async () => {
      const { Ctor, requestPermissionMock } = makeNotificationMock('denied')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      await act(() => result.current.requestPermission())

      expect(requestPermissionMock).not.toHaveBeenCalled()
    })

    it('is a no-op when Notification is not supported', async () => {
      vi.stubGlobal('Notification', undefined)

      const { result } = renderHook(() => useNotifications())
      // Should not throw
      await act(() => result.current.requestPermission())
    })
  })

  describe('notifyCompleted', () => {
    it('creates a notification with the filename as body', () => {
      const { Ctor, instances } = makeNotificationMock('granted')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      act(() => result.current.notifyCompleted(makeItem('abc')))

      expect(instances).toHaveLength(1)
      expect(instances[0].title).toBe('Upload complete')
      expect(instances[0].options?.body).toBe('abc.jpg')
    })

    it('does not create a notification when permission is denied', () => {
      const { Ctor, instances } = makeNotificationMock('denied')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      act(() => result.current.notifyCompleted(makeItem('abc')))

      expect(instances).toHaveLength(0)
    })

    it('does not create a notification when permission is default', () => {
      const { Ctor, instances } = makeNotificationMock('default')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      act(() => result.current.notifyCompleted(makeItem('abc')))

      expect(instances).toHaveLength(0)
    })

    it('is a no-op when Notification is not supported', () => {
      vi.stubGlobal('Notification', undefined)

      const { result } = renderHook(() => useNotifications())
      // Should not throw
      act(() => result.current.notifyCompleted(makeItem('abc')))
    })

    it('does not fire a second notification for the same item id', () => {
      const { Ctor, instances } = makeNotificationMock('granted')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())
      const item = makeItem('abc')

      act(() => {
        result.current.notifyCompleted(item)
        result.current.notifyCompleted(item)
      })

      expect(instances).toHaveLength(1)
    })

    it('fires separate notifications for different item ids', () => {
      const { Ctor, instances } = makeNotificationMock('granted')
      vi.stubGlobal('Notification', Ctor)

      const { result } = renderHook(() => useNotifications())

      act(() => {
        result.current.notifyCompleted(makeItem('a'))
        result.current.notifyCompleted(makeItem('b'))
      })

      expect(instances).toHaveLength(2)
    })

    it('sets onclick to focus the window', () => {
      const { Ctor, instances } = makeNotificationMock('granted')
      vi.stubGlobal('Notification', Ctor)
      const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {})

      const { result } = renderHook(() => useNotifications())
      act(() => result.current.notifyCompleted(makeItem('abc')))

      instances[0].onclick?.()
      expect(focusSpy).toHaveBeenCalledOnce()
    })
  })
})
