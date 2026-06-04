import { fireEvent, render, screen } from '@testing-library/react-native'
import { UploadCard } from '../UploadCard'
import type { UploadItem } from '../../types/uploads'

// MediaThumbnail has complex native deps (expo-video, expo-video-thumbnails).
// We stub it out — its own test file covers its behavior.
jest.mock('../MediaThumbnail', () => ({ MediaThumbnail: () => null }))

const handlers = {
  onStart: jest.fn(),
  onPause: jest.fn(),
  onCancel: jest.fn(),
  onRemove: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

function makeItem(overrides?: Partial<UploadItem>): UploadItem {
  return {
    id: 'test-id',
    file: { uri: 'file://test.jpg', name: 'photo.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' },
    status: 'queued',
    progress: 0,
    uploadedChunks: 0,
    totalChunks: 2,
    ...overrides,
  }
}

describe('UploadCard', () => {
  describe('content', () => {
    it('displays the file name', () => {
      render(<UploadCard item={makeItem()} {...handlers} />)
      expect(screen.getByText('photo.jpg')).toBeOnTheScreen()
    })

    it('shows the file extension as the type', () => {
      render(<UploadCard item={makeItem()} {...handlers} />)
      expect(screen.getByText('JPG')).toBeOnTheScreen()
    })

    it('falls back to the MIME type prefix when the file extension is empty', () => {
      // A filename ending in '.' produces an empty string from pop(), which is
      // falsy, so the || fallback shows the MIME type prefix instead.
      const item = makeItem({
        file: { uri: 'file://data', name: 'file.', size: 1024, type: 'image/jpeg' },
      })
      render(<UploadCard item={item} {...handlers} />)
      expect(screen.getByText('image')).toBeOnTheScreen()
    })

    it('shows the formatted file size', () => {
      render(<UploadCard item={makeItem()} {...handlers} />)
      expect(screen.getByText('2.0 MB')).toBeOnTheScreen()
    })

    it('shows the chunk count', () => {
      render(<UploadCard item={makeItem({ uploadedChunks: 1, totalChunks: 4 })} {...handlers} />)
      expect(screen.getByText('1 / 4')).toBeOnTheScreen()
    })

    it('shows resolution when the file has width and height', () => {
      render(
        <UploadCard
          item={makeItem({ file: { uri: 'file://test.jpg', name: 'photo.jpg', size: 1024, type: 'image/jpeg', width: 1920, height: 1080 } })}
          {...handlers}
        />,
      )
      expect(screen.getByText('1920 × 1080')).toBeOnTheScreen()
    })

    it('does not show resolution when dimensions are absent', () => {
      render(<UploadCard item={makeItem()} {...handlers} />)
      expect(screen.queryByText(/×/)).toBeNull()
    })

    it('shows duration for video files that have one', () => {
      render(
        <UploadCard
          item={makeItem({ file: { uri: 'file://clip.mp4', name: 'clip.mp4', size: 1024, type: 'video/mp4', duration: 125_000 } })}
          {...handlers}
        />,
      )
      expect(screen.getByText('2:05')).toBeOnTheScreen()
    })

    it('shows an error message when the item has an error', () => {
      render(<UploadCard item={makeItem({ error: 'Upload failed: network timeout' })} {...handlers} />)
      expect(screen.getByText('Upload failed: network timeout')).toBeOnTheScreen()
    })

    it('does not show an error when there is none', () => {
      render(<UploadCard item={makeItem()} {...handlers} />)
      expect(screen.queryByText(/failed/i)).toBeNull()
    })
  })

  describe('progress bar', () => {
    it('shows progress info while uploading', () => {
      render(<UploadCard item={makeItem({ status: 'uploading', uploadedChunks: 1, totalChunks: 2, progress: 50 })} {...handlers} />)
      expect(screen.getByText('1/2 chunks · 50%')).toBeOnTheScreen()
    })

    it('shows progress info while paused', () => {
      render(<UploadCard item={makeItem({ status: 'paused', uploadedChunks: 1, totalChunks: 2, progress: 50 })} {...handlers} />)
      expect(screen.getByText('1/2 chunks · 50%')).toBeOnTheScreen()
    })

    it('hides progress info when queued', () => {
      render(<UploadCard item={makeItem({ status: 'queued' })} {...handlers} />)
      expect(screen.queryByText(/chunks/)).toBeNull()
    })

    it('hides progress info when completed', () => {
      render(<UploadCard item={makeItem({ status: 'completed' })} {...handlers} />)
      expect(screen.queryByText(/chunks/)).toBeNull()
    })
  })

  describe('action buttons', () => {
    it('shows Upload for a queued item', () => {
      render(<UploadCard item={makeItem({ status: 'queued' })} {...handlers} />)
      expect(screen.getByText('Upload')).toBeOnTheScreen()
    })

    it('calls onStart when Upload is pressed', () => {
      render(<UploadCard item={makeItem({ status: 'queued' })} {...handlers} />)
      fireEvent.press(screen.getByText('Upload'))
      expect(handlers.onStart).toHaveBeenCalledTimes(1)
    })

    it('shows Remove for a completed item', () => {
      render(<UploadCard item={makeItem({ status: 'completed' })} {...handlers} />)
      expect(screen.getByText('Remove')).toBeOnTheScreen()
    })
  })
})
