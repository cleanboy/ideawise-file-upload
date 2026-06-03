import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HistoryModal } from './HistoryModal'
import type { HistoryEntry } from '../utils/uploadHistory'
import { useRef } from 'react'

const NOW = new Date('2026-06-03T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'e1',
    name: 'photo.jpg',
    size: 1024,
    type: 'image/jpeg',
    status: 'completed',
    savedAt: NOW - 5 * 60_000,
    ...overrides,
  }
}

function ModalWrapper({
  entries,
  onClear = vi.fn(),
  closeRef,
}: {
  entries: HistoryEntry[]
  onClear?: () => void
  closeRef?: React.MutableRefObject<(() => void) | undefined>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  if (closeRef) closeRef.current = () => dialogRef.current?.close()
  return <HistoryModal dialogRef={dialogRef} entries={entries} onClear={onClear} />
}

describe('HistoryModal — empty state', () => {
  it('shows "No upload history yet." when there are no entries', () => {
    render(<ModalWrapper entries={[]} />)
    expect(screen.getByText('No upload history yet.')).toBeInTheDocument()
  })

  it('does not show the Clear history button when there are no entries', () => {
    render(<ModalWrapper entries={[]} />)
    expect(screen.queryByRole('button', { name: 'Clear history' })).not.toBeInTheDocument()
  })
})

describe('HistoryModal — with entries', () => {
  it('renders the file name for each entry', () => {
    render(<ModalWrapper entries={[makeEntry({ name: 'video.mp4' })]} />)
    expect(screen.getByText('video.mp4')).toBeInTheDocument()
  })

  it('renders a status badge for each entry', () => {
    render(<ModalWrapper entries={[makeEntry({ status: 'completed' })]} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders failed and cancelled badges correctly', () => {
    render(
      <ModalWrapper
        entries={[
          makeEntry({ id: 'a', status: 'failed' }),
          makeEntry({ id: 'b', status: 'cancelled' }),
        ]}
      />,
    )
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('shows the formatted file size in the entry meta', () => {
    render(<ModalWrapper entries={[makeEntry({ size: 1024 })]} />)
    expect(screen.getByText('1.0 KB')).toBeInTheDocument()
  })

  it('shows the time-ago label in the entry meta', () => {
    render(<ModalWrapper entries={[makeEntry({ savedAt: NOW - 5 * 60_000 })]} />)
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('shows the error message for failed entries', () => {
    render(
      <ModalWrapper
        entries={[makeEntry({ status: 'failed', error: 'Network error — check your connection.' })]}
      />,
    )
    expect(screen.getByText('Network error — check your connection.')).toBeInTheDocument()
  })

  it('does not show an error block for entries without an error', () => {
    const { container } = render(<ModalWrapper entries={[makeEntry()]} />)
    expect(container.querySelector('.history-entry__error')).toBeNull()
  })

  it('shows the Clear history button', () => {
    render(<ModalWrapper entries={[makeEntry()]} />)
    // Use hidden:true because <dialog> without `open` is ARIA-hidden in jsdom
    expect(screen.getByRole('button', { name: 'Clear history', hidden: true })).toBeInTheDocument()
  })

  it('calls onClear when the Clear history button is clicked', () => {
    const onClear = vi.fn()
    render(<ModalWrapper entries={[makeEntry()]} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear history', hidden: true }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
