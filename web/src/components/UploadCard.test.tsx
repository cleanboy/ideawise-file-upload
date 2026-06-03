import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UploadCard } from './UploadCard'
import { usePreview } from '../hooks/usePreview'
import type { UploadItem } from '../types/uploads'
import type { PreviewMeta } from '../hooks/usePreview'

vi.mock('../hooks/usePreview', () => ({
  usePreview: vi.fn().mockReturnValue(null),
}))

function makeItem(overrides?: Partial<UploadItem>): UploadItem {
  return {
    id: 'item-1',
    file: new File([''], 'photo.jpg', { type: 'image/jpeg' }),
    status: 'queued',
    progress: 0,
    uploadedChunks: 0,
    totalChunks: 3,
    ...overrides,
  }
}

function makeProps(overrides?: Partial<Parameters<typeof UploadCard>[0]>) {
  return {
    selected: false,
    onCancel: vi.fn(),
    onPause: vi.fn(),
    onRemove: vi.fn(),
    onStart: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(usePreview).mockReturnValue(null)
})

// ─── rendering ───────────────────────────────────────────────────────────────

describe('UploadCard — rendering', () => {
  it('shows the file name as a heading', () => {
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByRole('heading', { name: 'photo.jpg' })).toBeInTheDocument()
  })

  it('shows the file extension in the type metadata row', () => {
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByText('JPG')).toBeInTheDocument()
  })

  it('shows the formatted file size', () => {
    const file = new File([new Uint8Array(1024 * 12)], 'photo.jpg', { type: 'image/jpeg' })
    render(<UploadCard item={makeItem({ file })} {...makeProps()} />)
    expect(screen.getByText('12 KB')).toBeInTheDocument()
  })

  it('shows chunk counts in the metadata', () => {
    render(<UploadCard item={makeItem({ uploadedChunks: 2, totalChunks: 5 })} {...makeProps()} />)
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('hides chunk counts for rejected items', () => {
    render(<UploadCard item={makeItem({ status: 'rejected', error: 'bad type' })} {...makeProps()} />)
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument()
  })

  it('shows an error message for non-rejected failed items', () => {
    render(<UploadCard item={makeItem({ status: 'failed', error: 'Upload failed' })} {...makeProps()} />)
    const msg = screen.getByText('Upload failed')
    expect(msg).toHaveClass('error-message')
  })

  it('shows a rejection reason with rejection-reason class for rejected items', () => {
    render(
      <UploadCard item={makeItem({ status: 'rejected', error: 'Invalid file type' })} {...makeProps()} />,
    )
    const msg = screen.getByText('Invalid file type')
    expect(msg).toHaveClass('rejection-reason')
  })

  it('hides the progress bar for rejected items', () => {
    const { container } = render(
      <UploadCard item={makeItem({ status: 'rejected', error: 'bad' })} {...makeProps()} />,
    )
    expect(container.querySelector('.progress-bar')).not.toBeInTheDocument()
  })

  it('shows progress bar using pausedProgress when set', () => {
    const { container } = render(
      <UploadCard
        item={makeItem({ status: 'paused', progress: 50, pausedProgress: 40 })}
        {...makeProps()}
      />,
    )
    const span = container.querySelector('.progress-bar span') as HTMLSpanElement
    expect(span.style.width).toBe('40%')
  })

  it('applies upload-card--rejected class for rejected items', () => {
    const { container } = render(
      <UploadCard item={makeItem({ status: 'rejected', error: 'bad' })} {...makeProps()} />,
    )
    expect(container.querySelector('.upload-card--rejected')).toBeInTheDocument()
  })

  it('checkbox reflects the selected prop', () => {
    render(<UploadCard item={makeItem()} {...makeProps({ selected: true })} />)
    expect(screen.getByRole('checkbox', { name: 'Select photo.jpg' })).toBeChecked()
  })
})

// ─── preview ─────────────────────────────────────────────────────────────────

describe('UploadCard — preview', () => {
  it('renders an image tag when usePreview returns a url for an image file', () => {
    vi.mocked(usePreview).mockReturnValue({ url: 'blob:img', width: 800, height: 600 })
    const { container } = render(<UploadCard item={makeItem()} {...makeProps()} />)
    // img has alt="" so its ARIA role is "presentation"; query by tag name directly
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:img')
  })

  it('renders a video tag when usePreview returns a url for a video file', () => {
    vi.mocked(usePreview).mockReturnValue({ url: 'blob:vid', width: 1920, height: 1080, duration: 60 })
    const videoItem = makeItem({ file: new File([''], 'clip.mp4', { type: 'video/mp4' }) })
    const { container } = render(<UploadCard item={videoItem} {...makeProps()} />)
    expect(container.querySelector('video')).toHaveAttribute('src', 'blob:vid')
  })

  it('shows resolution when usePreview provides width and height', () => {
    vi.mocked(usePreview).mockReturnValue({ url: 'blob:img', width: 1280, height: 720 })
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByText('1280 × 720')).toBeInTheDocument()
  })

  it('shows duration when usePreview provides it', () => {
    vi.mocked(usePreview).mockReturnValue({ url: 'blob:vid', duration: 90 } as PreviewMeta)
    const videoItem = makeItem({ file: new File([''], 'clip.mp4', { type: 'video/mp4' }) })
    render(<UploadCard item={videoItem} {...makeProps()} />)
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('does not render image or video when usePreview returns null', () => {
    const { container } = render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })
})

// ─── button labels and disabled states ───────────────────────────────────────

describe('UploadCard — buttons', () => {
  it('shows Start button when status is queued', () => {
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('shows Pause button when status is uploading (no Start)', () => {
    render(<UploadCard item={makeItem({ status: 'uploading' })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('shows Retry when status is failed', () => {
    render(<UploadCard item={makeItem({ status: 'failed' })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows Resume when status is paused', () => {
    render(<UploadCard item={makeItem({ status: 'paused' })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('disables Start when status is completed', () => {
    render(<UploadCard item={makeItem({ status: 'completed' })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('disables Start when status is rejected', () => {
    render(<UploadCard item={makeItem({ status: 'rejected', error: 'bad' })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it.each(['completed', 'cancelled', 'rejected'] as const)(
    'disables Cancel when status is %s',
    (status) => {
      render(
        <UploadCard item={makeItem({ status, error: status === 'rejected' ? 'bad' : undefined })} {...makeProps()} />,
      )
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    },
  )

  it.each(['uploading', 'completed'] as const)('disables Remove when status is %s', (status) => {
    render(<UploadCard item={makeItem({ status })} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('Cancel is enabled when status is queued', () => {
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('Remove is enabled when status is queued', () => {
    render(<UploadCard item={makeItem()} {...makeProps()} />)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })
})

// ─── callbacks ───────────────────────────────────────────────────────────────

describe('UploadCard — callbacks', () => {
  it('calls onPause with the item when Pause is clicked', async () => {
    const onPause = vi.fn()
    const item = makeItem({ status: 'uploading' })
    render(<UploadCard item={item} {...makeProps({ onPause })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(onPause).toHaveBeenCalledWith(item)
  })

  it('calls onStart with the item when Start is clicked', async () => {
    const onStart = vi.fn()
    const item = makeItem()
    render(<UploadCard item={item} {...makeProps({ onStart })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onStart).toHaveBeenCalledWith(item)
  })

  it('calls onCancel with the item when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const item = makeItem()
    render(<UploadCard item={item} {...makeProps({ onCancel })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledWith(item)
  })

  it('calls onRemove with the item when Remove is clicked', async () => {
    const onRemove = vi.fn()
    const item = makeItem()
    render(<UploadCard item={item} {...makeProps({ onRemove })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(item)
  })

  it('calls onToggleSelect with the item id when the checkbox is changed', async () => {
    const onToggleSelect = vi.fn()
    render(<UploadCard item={makeItem()} {...makeProps({ onToggleSelect })} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select photo.jpg' }))
    expect(onToggleSelect).toHaveBeenCalledWith('item-1')
  })
})
