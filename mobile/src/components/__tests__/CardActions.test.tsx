import { fireEvent, render, screen } from '@testing-library/react-native'
import { CardActions } from '../CardActions'
import type { UploadStatus } from '../../types/uploads'

const handlers = {
  onStart: jest.fn(),
  onPause: jest.fn(),
  onCancel: jest.fn(),
  onRemove: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

function renderActions(status: UploadStatus) {
  render(<CardActions status={status} {...handlers} />)
}

describe('CardActions', () => {
  describe('queued', () => {
    it('shows Upload and Cancel', () => {
      renderActions('queued')
      expect(screen.getByText('Upload')).toBeOnTheScreen()
      expect(screen.getByText('Cancel')).toBeOnTheScreen()
    })

    it('hides Pause and Remove', () => {
      renderActions('queued')
      expect(screen.queryByText('Pause')).toBeNull()
      expect(screen.queryByText('Remove')).toBeNull()
    })

    it('calls onStart when Upload is pressed', () => {
      renderActions('queued')
      fireEvent.press(screen.getByText('Upload'))
      expect(handlers.onStart).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when Cancel is pressed', () => {
      renderActions('queued')
      fireEvent.press(screen.getByText('Cancel'))
      expect(handlers.onCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('uploading', () => {
    it('shows Pause and Cancel, hides Upload', () => {
      renderActions('uploading')
      expect(screen.getByText('Pause')).toBeOnTheScreen()
      expect(screen.getByText('Cancel')).toBeOnTheScreen()
      expect(screen.queryByText('Upload')).toBeNull()
    })

    it('calls onPause when Pause is pressed', () => {
      renderActions('uploading')
      fireEvent.press(screen.getByText('Pause'))
      expect(handlers.onPause).toHaveBeenCalledTimes(1)
    })
  })

  describe('paused', () => {
    it('shows Resume and Cancel', () => {
      renderActions('paused')
      expect(screen.getByText('Resume')).toBeOnTheScreen()
      expect(screen.getByText('Cancel')).toBeOnTheScreen()
    })

    it('calls onStart when Resume is pressed', () => {
      renderActions('paused')
      fireEvent.press(screen.getByText('Resume'))
      expect(handlers.onStart).toHaveBeenCalledTimes(1)
    })
  })

  describe('failed', () => {
    // failed is in STARTABLE but not in CANCELLABLE, so it gets Retry + Remove
    it('shows Retry and Remove', () => {
      renderActions('failed')
      expect(screen.getByText('Retry')).toBeOnTheScreen()
      expect(screen.getByText('Remove')).toBeOnTheScreen()
    })

    it('hides Cancel', () => {
      renderActions('failed')
      expect(screen.queryByText('Cancel')).toBeNull()
    })

    it('calls onStart when Retry is pressed', () => {
      renderActions('failed')
      fireEvent.press(screen.getByText('Retry'))
      expect(handlers.onStart).toHaveBeenCalledTimes(1)
    })
  })

  describe.each([['completed'], ['cancelled'], ['rejected']] as const)(
    '%s status',
    ([status]) => {
      it('shows only Remove — no Upload, Pause, or Cancel', () => {
        renderActions(status)
        expect(screen.getByText('Remove')).toBeOnTheScreen()
        expect(screen.queryByText('Upload')).toBeNull()
        expect(screen.queryByText('Pause')).toBeNull()
        expect(screen.queryByText('Cancel')).toBeNull()
      })

      it('calls onRemove when Remove is pressed', () => {
        renderActions(status)
        fireEvent.press(screen.getByText('Remove'))
        expect(handlers.onRemove).toHaveBeenCalledTimes(1)
      })
    },
  )
})
