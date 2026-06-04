import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Notifications from 'expo-notifications'
import { Alert } from 'react-native'
import App from '../App'
import type { UploadSession } from '../src/api/uploads'
import { finalizeUpload, initiateUpload, uploadChunk } from '../src/api/uploads'

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../src/background/uploadTask', () => ({
  registerBackgroundUploadTask: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/api/uploads', () => ({
  initiateUpload: jest.fn(),
  uploadChunk: jest.fn(),
  finalizeUpload: jest.fn(),
  cancelUpload: jest.fn(),
  getUploadStatus: jest.fn(),
  deleteUpload: jest.fn(),
}))

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}))

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}))

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaProvider: View, SafeAreaView: View }
})

jest.mock('../src/components/MediaThumbnail', () => ({ MediaThumbnail: () => null }))

// Collapse retries to be instant so tests don't time out on retry paths
jest.mock('../src/utils/sleep', () => ({ sleep: jest.fn() }))

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    uploadId: 'upload-1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    chunkSize: 1024 * 1024,
    totalChunks: 1,
    uploadedChunks: [],
    uploadedChunkCount: 0,
    progress: 0,
    status: 'initiated',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

const GALLERY_ASSET = {
  uri: 'file://photo.jpg',
  fileName: 'photo.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
  width: 100,
  height: 100,
  type: 'image' as const,
  assetId: null,
  base64: null,
  exif: null,
  duration: null,
  pairedVideoAsset: null,
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function grantGallery() {
  ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    status: 'granted', granted: true, expires: 'never', canAskAgain: true,
  })
}

function grantCamera() {
  ;(ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    status: 'granted', granted: true, expires: 'never', canAskAgain: true,
  })
}

async function queueOneFile() {
  grantGallery()
  ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
    canceled: false, assets: [GALLERY_ASSET],
  })
  fireEvent.press(screen.getByText('Gallery'))
  await waitFor(() => expect(screen.getByText('photo.jpg')).toBeOnTheScreen())
}

function setupCompleteUpload() {
  ;(initiateUpload as jest.Mock).mockResolvedValueOnce(makeSession())
  ;(uploadChunk as jest.Mock).mockResolvedValueOnce(
    makeSession({ uploadedChunks: [0], uploadedChunkCount: 1, progress: 100, status: 'uploading' }),
  )
  ;(finalizeUpload as jest.Mock).mockResolvedValueOnce(
    makeSession({
      status: 'completed',
      progress: 100,
      uploadedChunkCount: 1,
      uploadedChunks: [0],
      completedAt: '2024-01-01T00:00:00Z',
    }),
  )
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  ;(AsyncStorage as unknown as { __INTERNAL_MOCK_STORAGE__: Record<string, string> }).__INTERNAL_MOCK_STORAGE__ = {}
  // clearAllMocks preserves native-module mock implementations (e.g. AppState.addEventListener
  // which must return a subscription with .remove()). resetAllMocks breaks those.
  jest.clearAllMocks()
  // Explicitly reset the mocks we own so leftover once-queues from previous tests don't bleed through
  for (const fn of [initiateUpload, uploadChunk, finalizeUpload] as jest.Mock[]) fn.mockReset()
  for (const fn of [
    ImagePicker.requestMediaLibraryPermissionsAsync,
    ImagePicker.launchImageLibraryAsync,
    ImagePicker.requestCameraPermissionsAsync,
    ImagePicker.launchCameraAsync,
  ] as jest.Mock[]) fn.mockReset()
  // requestPermissionsAsync is chained with .catch() in useNotifications — must return a Promise
  ;(Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('App', () => {
  describe('initial state', () => {
    it('shows the empty-state message when there are no uploads', async () => {
      render(<App />)
      await act(async () => {}) // flush loadQueue / mount effects
      expect(
        screen.getByText('Pick files from your gallery or camera to get started.'),
      ).toBeOnTheScreen()
    })

    it('shows Gallery and Camera picker buttons', async () => {
      render(<App />)
      await act(async () => {})
      expect(screen.getByText('Gallery')).toBeOnTheScreen()
      expect(screen.getByText('Camera')).toBeOnTheScreen()
    })

    it('shows the History button', async () => {
      render(<App />)
      await act(async () => {})
      expect(screen.getByText('History')).toBeOnTheScreen()
    })
  })

  describe('file picker', () => {
    it('adds an upload card for each file picked from the gallery', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      expect(screen.getByText('photo.jpg')).toBeOnTheScreen()
      expect(screen.getByText('Queued')).toBeOnTheScreen()
    })

    it('adds an upload card for a photo captured with the camera', async () => {
      render(<App />)
      await act(async () => {})
      grantCamera()
      ;(ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false, assets: [GALLERY_ASSET],
      })
      fireEvent.press(screen.getByText('Camera'))
      await waitFor(() => expect(screen.getByText('photo.jpg')).toBeOnTheScreen())
    })

    it('does nothing when the gallery picker is dismissed by the user', async () => {
      render(<App />)
      await act(async () => {})
      grantGallery()
      ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: true, assets: null,
      })
      fireEvent.press(screen.getByText('Gallery'))
      await act(async () => {})
      expect(screen.queryByText('Queued')).toBeNull()
    })

    it('shows an alert when gallery permission is denied', async () => {
      render(<App />)
      await act(async () => {})
      const alertSpy = jest.spyOn(Alert, 'alert')
      ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied', granted: false, expires: 'never', canAskAgain: false,
      })
      fireEvent.press(screen.getByText('Gallery'))
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Permission required',
          expect.stringContaining('photo library'),
        ),
      )
    })

    it('shows an alert when camera permission is denied', async () => {
      render(<App />)
      await act(async () => {})
      const alertSpy = jest.spyOn(Alert, 'alert')
      ;(ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied', granted: false, expires: 'never', canAskAgain: false,
      })
      fireEvent.press(screen.getByText('Camera'))
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Permission required',
          expect.stringContaining('camera'),
        ),
      )
    })
  })

  describe('file validation', () => {
    it('rejects a file with an unsupported MIME type', async () => {
      render(<App />)
      await act(async () => {})
      grantGallery()
      ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ ...GALLERY_ASSET, mimeType: 'application/pdf', fileName: 'doc.pdf' }],
      })
      fireEvent.press(screen.getByText('Gallery'))
      await waitFor(() => expect(screen.getByText('Rejected')).toBeOnTheScreen())
      expect(screen.getByText(/Invalid file type/)).toBeOnTheScreen()
    })

    it('rejects a file that exceeds the 2 GB size limit', async () => {
      render(<App />)
      await act(async () => {})
      grantGallery()
      ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{
          ...GALLERY_ASSET,
          fileSize: 3 * 1024 * 1024 * 1024,
          fileName: 'huge.mp4',
          mimeType: 'video/mp4',
        }],
      })
      fireEvent.press(screen.getByText('Gallery'))
      await waitFor(() => expect(screen.getByText('Rejected')).toBeOnTheScreen())
      expect(screen.getByText(/2 GB/)).toBeOnTheScreen()
    })
  })

  describe('upload lifecycle', () => {
    it('shows the "Upload all" button with a count of pending files', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      expect(screen.getByText('Upload all (1)')).toBeOnTheScreen()
    })

    it('completes a single-file upload end-to-end', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      setupCompleteUpload()
      fireEvent.press(screen.getByText('Upload'))
      // StatusBadge maps completed → label "Done"
      await waitFor(() => expect(screen.getByText('Done')).toBeOnTheScreen())
    })

    it('shows an overall progress bar and counter while an upload is active', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()

      // Defer initiateUpload so the upload stays in 'uploading' status while we assert.
      // startUpload sets status → 'uploading' BEFORE awaiting initiateUpload, giving us a
      // reliable window to observe the progress bar.
      let resolveInitiate!: (session: UploadSession) => void
      ;(initiateUpload as jest.Mock).mockReturnValueOnce(
        new Promise<UploadSession>((res) => { resolveInitiate = res }),
      )

      fireEvent.press(screen.getByText('Upload'))
      // One async act flush drains the microtask continuations up to the pending initiateUpload
      await act(async () => {})
      expect(screen.getByText('1 file uploading')).toBeOnTheScreen()

      // Let the upload finish so state settles before teardown
      ;(uploadChunk as jest.Mock).mockResolvedValueOnce(
        makeSession({ uploadedChunks: [0], uploadedChunkCount: 1, progress: 100, status: 'uploading' }),
      )
      ;(finalizeUpload as jest.Mock).mockResolvedValueOnce(
        makeSession({ status: 'completed', progress: 100, uploadedChunkCount: 1, uploadedChunks: [0], completedAt: '2024-01-01T00:00:00Z' }),
      )
      await act(async () => { resolveInitiate(makeSession()) })
      await waitFor(() => expect(screen.queryByText('1 file uploading')).toBeNull())
    })

    it('marks the card as failed and shows the error message when the upload errors', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      ;(initiateUpload as jest.Mock).mockRejectedValueOnce(new Error('Network error'))
      fireEvent.press(screen.getByText('Upload'))
      await waitFor(() => expect(screen.getByText('Failed')).toBeOnTheScreen())
      expect(screen.getByText('Network error')).toBeOnTheScreen()
    })

    it('retries a failed upload when Retry is pressed', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      ;(initiateUpload as jest.Mock).mockRejectedValueOnce(new Error('Timeout'))
      fireEvent.press(screen.getByText('Upload'))
      await waitFor(() => expect(screen.getByText('Failed')).toBeOnTheScreen())

      setupCompleteUpload()
      fireEvent.press(screen.getByText('Retry'))
      await waitFor(() => expect(screen.getByText('Done')).toBeOnTheScreen())
    })

    it('cancels a queued upload when Cancel is pressed', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      fireEvent.press(screen.getByText('Cancel'))
      await waitFor(() => expect(screen.getByText('Cancelled')).toBeOnTheScreen())
    })

    it('removes a card from the list when Remove is pressed', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      setupCompleteUpload()
      fireEvent.press(screen.getByText('Upload'))
      await waitFor(() => expect(screen.getByText('Done')).toBeOnTheScreen())
      fireEvent.press(screen.getByText('Remove'))
      await waitFor(() => expect(screen.queryByText('photo.jpg')).toBeNull())
    })
  })

  describe('upload history', () => {
    it('opens the history modal to the empty state', async () => {
      render(<App />)
      await act(async () => {})
      fireEvent.press(screen.getByText('History'))
      await waitFor(() => expect(screen.getByText('No uploads yet.')).toBeOnTheScreen())
    })

    it('records a completed upload in the history modal', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      setupCompleteUpload()
      fireEvent.press(screen.getByText('Upload'))
      // Wait for the upload to complete (StatusBadge shows "Done" for completed status)
      await waitFor(() => expect(screen.getByText('Done')).toBeOnTheScreen())

      fireEvent.press(screen.getByText('History'))
      // photo.jpg appears in both the active upload card and the history modal row
      await waitFor(() => expect(screen.getAllByText('photo.jpg').length).toBeGreaterThanOrEqual(2))
    })

    it('clears all history entries when "Clear history" is pressed', async () => {
      render(<App />)
      await act(async () => {})
      await queueOneFile()
      setupCompleteUpload()
      fireEvent.press(screen.getByText('Upload'))
      // Wait for the upload to complete (StatusBadge shows "Done" for completed status)
      await waitFor(() => expect(screen.getByText('Done')).toBeOnTheScreen())

      fireEvent.press(screen.getByText('History'))
      await waitFor(() => expect(screen.getByText('Clear history')).toBeOnTheScreen())
      fireEvent.press(screen.getByText('Clear history'))
      await waitFor(() => expect(screen.getByText('No uploads yet.')).toBeOnTheScreen())
    })
  })
})
