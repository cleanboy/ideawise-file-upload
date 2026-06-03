import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DropZone } from './DropZone'

function makeFileList(...files: File[]): FileList {
  return Object.assign(files, {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList
}

describe('DropZone', () => {
  it('renders a file input with accept="image/*,video/*" and multiple', () => {
    const { container } = render(<DropZone onFilesSelected={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/*,video/*')
  })

  it('renders the drop prompt text', () => {
    render(<DropZone onFilesSelected={vi.fn()} />)
    expect(screen.getByText('Drop files here or choose files')).toBeInTheDocument()
  })

  it('calls onFilesSelected when files are chosen via the input', () => {
    const onFilesSelected = vi.fn()
    const { container } = render(<DropZone onFilesSelected={onFilesSelected} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const files = makeFileList(new File([''], 'photo.jpg', { type: 'image/jpeg' }))
    Object.defineProperty(input, 'files', { value: files, configurable: true })

    fireEvent.change(input)

    expect(onFilesSelected).toHaveBeenCalledOnce()
    expect(onFilesSelected).toHaveBeenCalledWith(files)
  })

  it('does not call onFilesSelected when the input fires change with no files', () => {
    const onFilesSelected = vi.fn()
    const { container } = render(<DropZone onFilesSelected={onFilesSelected} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', { value: null, configurable: true })
    fireEvent.change(input)

    expect(onFilesSelected).not.toHaveBeenCalled()
  })

  it('calls onFilesSelected with dropped files', () => {
    const onFilesSelected = vi.fn()
    const { container } = render(<DropZone onFilesSelected={onFilesSelected} />)
    const label = container.querySelector('.drop-zone')!

    const file = new File([''], 'video.mp4', { type: 'video/mp4' })
    const files = makeFileList(file)

    // Attach dataTransfer directly to the native event before dispatch
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files } })
    fireEvent(label, dropEvent)

    expect(onFilesSelected).toHaveBeenCalledOnce()
    expect(onFilesSelected).toHaveBeenCalledWith(files)
  })

  it('prevents default on dragover', () => {
    const { container } = render(<DropZone onFilesSelected={vi.fn()} />)
    const label = container.querySelector('.drop-zone')!
    // fireEvent returns false when preventDefault() was called on a cancelable event
    expect(fireEvent.dragOver(label)).toBe(false)
  })
})
