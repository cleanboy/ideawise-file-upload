import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { TouchableOpacity } from 'react-native'
import { MediaThumbnail } from '../MediaThumbnail'
import type { MediaFile } from '../../types/uploads'

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: jest.fn().mockResolvedValue({ uri: 'file://thumbnail.jpg' }),
}))
jest.mock('expo-video', () => ({
  // Invoke the setup callback so lines inside it (p.loop, p.play) are covered
  useVideoPlayer: jest.fn((_, callback) => {
    callback?.({ loop: false, play: jest.fn() })
    return {}
  }),
  VideoView: () => null,
}))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View }
})

const imageFile: MediaFile = {
  uri: 'file://photo.jpg',
  name: 'photo.jpg',
  size: 1024,
  type: 'image/jpeg',
}

const videoFile: MediaFile = {
  uri: 'file://clip.mp4',
  name: 'clip.mp4',
  size: 10240,
  type: 'video/mp4',
}

describe('MediaThumbnail', () => {
  describe('image file', () => {
    it('renders an Image with the file URI', () => {
      const { toJSON } = render(<MediaThumbnail file={imageFile} />)
      expect(JSON.stringify(toJSON())).toContain('file://photo.jpg')
    })

    it('opens the preview modal when the thumbnail is tapped', async () => {
      render(<MediaThumbnail file={imageFile} />)
      const [thumbnail] = screen.UNSAFE_getAllByType(TouchableOpacity)
      fireEvent.press(thumbnail)
      await waitFor(() => expect(screen.getByText('✕')).toBeOnTheScreen())
    })

    it('closes the preview modal when the close button is pressed', async () => {
      render(<MediaThumbnail file={imageFile} />)
      const [thumbnail] = screen.UNSAFE_getAllByType(TouchableOpacity)
      fireEvent.press(thumbnail)
      await waitFor(() => expect(screen.getByText('✕')).toBeOnTheScreen())

      fireEvent.press(screen.getByText('✕'))
      await waitFor(() => expect(screen.queryByText('✕')).toBeNull())
    })
  })

  describe('video file', () => {
    it('renders a TouchableOpacity for the video thumbnail', async () => {
      render(<MediaThumbnail file={videoFile} />)
      // waitFor flushes async effects (thumbnail fetch) so no act() warning
      await waitFor(() =>
        expect(screen.UNSAFE_getAllByType(TouchableOpacity).length).toBeGreaterThan(0),
      )
    })

    it('fetches a video thumbnail on mount', async () => {
      const { getThumbnailAsync } = require('expo-video-thumbnails')
      ;(getThumbnailAsync as jest.Mock).mockClear()
      render(<MediaThumbnail file={videoFile} />)
      await waitFor(() => {
        expect(getThumbnailAsync).toHaveBeenCalledWith(videoFile.uri, expect.any(Object))
      })
    })

    it('does not fetch a thumbnail for image files', async () => {
      const { getThumbnailAsync } = require('expo-video-thumbnails')
      ;(getThumbnailAsync as jest.Mock).mockClear()
      render(<MediaThumbnail file={imageFile} />)
      // Flush any pending promises/state updates before asserting
      await act(async () => {})
      expect(getThumbnailAsync).not.toHaveBeenCalled()
    })

    it('silently ignores a thumbnail fetch error', async () => {
      const { getThumbnailAsync } = require('expo-video-thumbnails')
      ;(getThumbnailAsync as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'))
      // Should render without throwing and show the placeholder
      render(<MediaThumbnail file={videoFile} />)
      await act(async () => {})
    })

    it('opens the preview modal when the thumbnail is tapped', async () => {
      render(<MediaThumbnail file={videoFile} />)
      const [thumbnail] = screen.UNSAFE_getAllByType(TouchableOpacity)
      fireEvent.press(thumbnail)
      await waitFor(() => expect(screen.getByText('✕')).toBeOnTheScreen())
    })

    it('closes the video preview modal when the close button is pressed', async () => {
      render(<MediaThumbnail file={videoFile} />)
      const [thumbnail] = screen.UNSAFE_getAllByType(TouchableOpacity)
      fireEvent.press(thumbnail)
      await waitFor(() => expect(screen.getByText('✕')).toBeOnTheScreen())

      fireEvent.press(screen.getByText('✕'))
      await waitFor(() => expect(screen.queryByText('✕')).toBeNull())
    })
  })
})
