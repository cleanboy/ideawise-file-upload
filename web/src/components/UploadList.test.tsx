import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { UploadList } from './UploadList'
import type { UploadItem } from '../types/uploads'

vi.mock('./UploadCard', () => ({
  UploadCard: ({ item }: { item: UploadItem }) => (
    <div data-testid="upload-card">{item.file.name}</div>
  ),
}))

function makeItem(id: string, overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id,
    file: new File([''], `file-${id}.jpg`, { type: 'image/jpeg' }),
    status: 'queued',
    progress: 0,
    uploadedChunks: 0,
    totalChunks: 1,
    ...overrides,
  }
}

function makeProps(overrides?: Partial<Parameters<typeof UploadList>[0]>) {
  return {
    uploads: [],
    selectedIds: new Set<string>(),
    startableSelected: false,
    onCancel: vi.fn(),
    onPause: vi.fn(),
    onRemove: vi.fn(),
    onStart: vi.fn(),
    onToggleSelect: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onStartSelected: vi.fn(),
    ...overrides,
  }
}

describe('UploadList — empty state', () => {
  it('shows "No files queued." when uploads is empty', () => {
    render(<UploadList {...makeProps()} />)
    expect(screen.getByText('No files queued.')).toBeInTheDocument()
  })

  it('does not render the header or cards when empty', () => {
    render(<UploadList {...makeProps()} />)
    expect(screen.queryByRole('button', { name: 'Start Selected' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('upload-card')).not.toBeInTheDocument()
  })
})

describe('UploadList — with uploads', () => {
  it('renders an UploadCard for each upload', () => {
    render(<UploadList {...makeProps({ uploads: [makeItem('1'), makeItem('2')] })} />)
    expect(screen.getAllByTestId('upload-card')).toHaveLength(2)
  })

  it('shows "Select all" label when not all items are selected', () => {
    render(
      <UploadList
        {...makeProps({ uploads: [makeItem('1'), makeItem('2')], selectedIds: new Set(['1']) })}
      />,
    )
    expect(screen.getByText('Select all')).toBeInTheDocument()
  })

  it('shows "Deselect all" label when all items are selected', () => {
    render(
      <UploadList
        {...makeProps({
          uploads: [makeItem('1'), makeItem('2')],
          selectedIds: new Set(['1', '2']),
        })}
      />,
    )
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('select-all checkbox is checked when all uploads are selected', () => {
    render(
      <UploadList
        {...makeProps({
          uploads: [makeItem('1'), makeItem('2')],
          selectedIds: new Set(['1', '2']),
        })}
      />,
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('select-all checkbox is unchecked when no uploads are selected', () => {
    render(<UploadList {...makeProps({ uploads: [makeItem('1')] })} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('sets checkbox to indeterminate when some but not all items are selected', () => {
    render(
      <UploadList
        {...makeProps({
          uploads: [makeItem('1'), makeItem('2'), makeItem('3')],
          selectedIds: new Set(['1']),
        })}
      />,
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.indeterminate).toBe(true)
  })

  it('disables Start Selected when startableSelected is false', () => {
    render(<UploadList {...makeProps({ uploads: [makeItem('1')], startableSelected: false })} />)
    expect(screen.getByRole('button', { name: 'Start Selected' })).toBeDisabled()
  })

  it('enables Start Selected when startableSelected is true', () => {
    render(<UploadList {...makeProps({ uploads: [makeItem('1')], startableSelected: true })} />)
    expect(screen.getByRole('button', { name: 'Start Selected' })).toBeEnabled()
  })

  it('calls onToggleSelectAll when the select-all checkbox is clicked', async () => {
    const onToggleSelectAll = vi.fn()
    render(<UploadList {...makeProps({ uploads: [makeItem('1')], onToggleSelectAll })} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggleSelectAll).toHaveBeenCalledOnce()
  })

  it('calls onStartSelected when Start Selected is clicked', async () => {
    const onStartSelected = vi.fn()
    render(
      <UploadList
        {...makeProps({ uploads: [makeItem('1')], startableSelected: true, onStartSelected })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start Selected' }))
    expect(onStartSelected).toHaveBeenCalledOnce()
  })
})

describe('UploadList — overall progress', () => {
  it('does not show overall progress when only one item is uploading', () => {
    const uploads = [makeItem('1', { status: 'uploading', progress: 50 })]
    render(<UploadList {...makeProps({ uploads })} />)
    expect(screen.queryByLabelText('Overall upload progress')).not.toBeInTheDocument()
  })

  it('does not show overall progress when uploading items are mixed with other statuses', () => {
    const uploads = [
      makeItem('1', { status: 'uploading', progress: 50 }),
      makeItem('2', { status: 'completed', progress: 100 }),
    ]
    render(<UploadList {...makeProps({ uploads })} />)
    expect(screen.queryByLabelText('Overall upload progress')).not.toBeInTheDocument()
  })

  it('shows overall progress when 2 or more items are uploading', () => {
    const uploads = [
      makeItem('1', { status: 'uploading', progress: 40 }),
      makeItem('2', { status: 'uploading', progress: 60 }),
    ]
    render(<UploadList {...makeProps({ uploads })} />)
    expect(screen.getByLabelText('Overall upload progress')).toBeInTheDocument()
  })

  it('displays the averaged progress across all uploading items', () => {
    const uploads = [
      makeItem('1', { status: 'uploading', progress: 40 }),
      makeItem('2', { status: 'uploading', progress: 60 }),
    ]
    const { container } = render(<UploadList {...makeProps({ uploads })} />)
    const fill = container.querySelector('.overall-progress .progress-bar span') as HTMLElement
    expect(fill.style.width).toBe('50%')
  })

  it('averages correctly across 3 uploading items', () => {
    const uploads = [
      makeItem('1', { status: 'uploading', progress: 0 }),
      makeItem('2', { status: 'uploading', progress: 60 }),
      makeItem('3', { status: 'uploading', progress: 90 }),
    ]
    const { container } = render(<UploadList {...makeProps({ uploads })} />)
    const fill = container.querySelector('.overall-progress .progress-bar span') as HTMLElement
    expect(fill.style.width).toBe('50%')
  })
})
