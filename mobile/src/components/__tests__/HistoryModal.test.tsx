import { fireEvent, render, screen } from '@testing-library/react-native'
import { HistoryModal } from '../HistoryModal'
import type { HistoryEntry } from '../../utils/uploadHistory'

function makeEntry(id: string, status: HistoryEntry['status'] = 'completed'): HistoryEntry {
  return { id, name: `${id}.jpg`, size: 1024 * 1024, type: 'image/jpeg', status, savedAt: Date.now() }
}

const baseProps = {
  visible: true,
  onClear: jest.fn(),
  onClose: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

describe('HistoryModal', () => {
  describe('empty state', () => {
    it('shows "No uploads yet." when there are no entries', () => {
      render(<HistoryModal {...baseProps} entries={[]} />)
      expect(screen.getByText('No uploads yet.')).toBeOnTheScreen()
    })

    it('does not show "Clear history" when empty', () => {
      render(<HistoryModal {...baseProps} entries={[]} />)
      expect(screen.queryByText('Clear history')).toBeNull()
    })
  })

  describe('with entries', () => {
    const entries = [makeEntry('photo'), makeEntry('video', 'failed')]

    it('renders each entry name', () => {
      render(<HistoryModal {...baseProps} entries={entries} />)
      expect(screen.getByText('photo.jpg')).toBeOnTheScreen()
      expect(screen.getByText('video.jpg')).toBeOnTheScreen()
    })

    it('renders each entry status', () => {
      render(<HistoryModal {...baseProps} entries={entries} />)
      expect(screen.getByText('completed')).toBeOnTheScreen()
      expect(screen.getByText('failed')).toBeOnTheScreen()
    })

    it('shows "Clear history" button', () => {
      render(<HistoryModal {...baseProps} entries={entries} />)
      expect(screen.getByText('Clear history')).toBeOnTheScreen()
    })

    it('calls onClear when "Clear history" is pressed', () => {
      render(<HistoryModal {...baseProps} entries={entries} />)
      fireEvent.press(screen.getByText('Clear history'))
      expect(baseProps.onClear).toHaveBeenCalledTimes(1)
    })

    it('shows an error message for failed entries that have one', () => {
      const failedWithError: HistoryEntry = {
        ...makeEntry('clip', 'failed'),
        error: 'Network timeout',
      }
      render(<HistoryModal {...baseProps} entries={[failedWithError]} />)
      expect(screen.getByText('Network timeout')).toBeOnTheScreen()
    })
  })

  describe('close button', () => {
    it('calls onClose when "Done" is pressed', () => {
      render(<HistoryModal {...baseProps} entries={[]} />)
      fireEvent.press(screen.getByText('Done'))
      expect(baseProps.onClose).toHaveBeenCalledTimes(1)
    })
  })
})
