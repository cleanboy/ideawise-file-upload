import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { useUploads } from './hooks/useUploads'
import type { UploadItem } from './types/uploads'

vi.mock('./hooks/useUploads')

// Minimal stubs for child components — we test their internals in their own files.
vi.mock('./components/DropZone', () => ({
  DropZone: ({ onFilesSelected }: { onFilesSelected: (f: FileList) => void }) => (
    <button
      data-testid="dropzone"
      onClick={() => {
        const file = new File([''], 'dropped.jpg', { type: 'image/jpeg' })
        const files = Object.assign([file], { item: (i: number) => (i === 0 ? file : null) }) as unknown as FileList
        onFilesSelected(files)
      }}
    >
      Drop Zone
    </button>
  ),
}))

vi.mock('./components/UploadList', () => ({
  UploadList: ({
    uploads,
    selectedIds,
    startableSelected,
    onToggleSelect,
    onToggleSelectAll,
    onStartSelected,
    onStart,
    onCancel,
    onPause,
    onRemove,
  }: {
    uploads: UploadItem[]
    selectedIds: Set<string>
    startableSelected: boolean
    onToggleSelect: (id: string) => void
    onToggleSelectAll: () => void
    onStartSelected: () => void
    onStart: (item: UploadItem) => void
    onCancel: (item: UploadItem) => void
    onPause: (item: UploadItem) => void
    onRemove: (item: UploadItem) => void
  }) => (
    <div data-testid="upload-list">
      <span data-testid="upload-count">{uploads.length}</span>
      <span data-testid="selected-count">{selectedIds.size}</span>
      <span data-testid="startable">{String(startableSelected)}</span>
      <button onClick={onToggleSelectAll}>Toggle All</button>
      <button onClick={onStartSelected} disabled={!startableSelected}>
        Start Selected
      </button>
      {uploads.map((u) => (
        <div key={u.id}>
          <button onClick={() => onToggleSelect(u.id)}>Select {u.id}</button>
          <button onClick={() => onStart(u)}>Start {u.id}</button>
          <button onClick={() => onCancel(u)}>Cancel {u.id}</button>
          <button onClick={() => onPause(u)}>Pause {u.id}</button>
          <button onClick={() => onRemove(u)}>Remove {u.id}</button>
        </div>
      ))}
    </div>
  ),
}))

function makeItem(id: string, status: UploadItem['status'] = 'queued'): UploadItem {
  return {
    id,
    file: new File([''], `file-${id}.jpg`, { type: 'image/jpeg' }),
    status,
    progress: 0,
    uploadedChunks: 0,
    totalChunks: 1,
  }
}

function mockUploads(items: UploadItem[] = []) {
  const queueFiles = vi.fn()
  const startUpload = vi.fn().mockResolvedValue(undefined)
  const cancelItem = vi.fn().mockResolvedValue(undefined)
  const pauseItem = vi.fn()
  const removeItem = vi.fn().mockResolvedValue(undefined)

  vi.mocked(useUploads).mockReturnValue({
    uploads: items,
    queueFiles,
    startUpload,
    cancelItem,
    pauseItem,
    removeItem,
  })

  return { queueFiles, startUpload, cancelItem, pauseItem, removeItem }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('App', () => {
  it('renders the heading and drop zone', () => {
    mockUploads()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Web uploader' })).toBeInTheDocument()
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('passes uploads from the hook to UploadList', () => {
    mockUploads([makeItem('a'), makeItem('b')])
    render(<App />)
    expect(screen.getByTestId('upload-count').textContent).toBe('2')
  })

  it('calls queueFiles when DropZone fires onFilesSelected', async () => {
    const { queueFiles } = mockUploads()
    render(<App />)
    await userEvent.click(screen.getByTestId('dropzone'))
    expect(queueFiles).toHaveBeenCalledOnce()
  })

  it('calls startUpload when an item start button is pressed', async () => {
    const item = makeItem('x')
    const { startUpload } = mockUploads([item])
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Start x' }))
    expect(startUpload).toHaveBeenCalledWith(item)
  })

  it('calls cancelItem when an item cancel button is pressed', async () => {
    const item = makeItem('x')
    const { cancelItem } = mockUploads([item])
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel x' }))
    expect(cancelItem).toHaveBeenCalledWith(item)
  })

  it('calls pauseItem when an item pause button is pressed', async () => {
    const item = makeItem('x')
    const { pauseItem } = mockUploads([item])
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Pause x' }))
    expect(pauseItem).toHaveBeenCalledWith(item)
  })

  it('calls removeItem when an item remove button is pressed', async () => {
    const item = makeItem('x')
    const { removeItem } = mockUploads([item])
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove x' }))
    expect(removeItem).toHaveBeenCalledWith(item)
  })

  describe('toggleSelect', () => {
    it('selects an item when its toggle is clicked', async () => {
      mockUploads([makeItem('a')])
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: 'Select a' }))
      expect(screen.getByTestId('selected-count').textContent).toBe('1')
    })

    it('deselects an item when its toggle is clicked a second time', async () => {
      mockUploads([makeItem('a')])
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: 'Select a' }))
      await userEvent.click(screen.getByRole('button', { name: 'Select a' }))
      expect(screen.getByTestId('selected-count').textContent).toBe('0')
    })
  })

  describe('toggleSelectAll', () => {
    it('selects all items when none are selected', async () => {
      mockUploads([makeItem('a'), makeItem('b')])
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: 'Toggle All' }))
      expect(screen.getByTestId('selected-count').textContent).toBe('2')
    })

    it('deselects all items when all are already selected', async () => {
      mockUploads([makeItem('a'), makeItem('b')])
      render(<App />)
      // Select all first
      await userEvent.click(screen.getByRole('button', { name: 'Toggle All' }))
      // Deselect all
      await userEvent.click(screen.getByRole('button', { name: 'Toggle All' }))
      expect(screen.getByTestId('selected-count').textContent).toBe('0')
    })
  })

  describe('startSelected', () => {
    it('starts all selected items with a startable status', async () => {
      const queued = makeItem('q', 'queued')
      const completed = makeItem('c', 'completed')
      const { startUpload } = mockUploads([queued, completed])
      render(<App />)

      // Select both items
      await userEvent.click(screen.getByRole('button', { name: 'Select q' }))
      await userEvent.click(screen.getByRole('button', { name: 'Select c' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start Selected' }))

      expect(startUpload).toHaveBeenCalledTimes(1)
      expect(startUpload).toHaveBeenCalledWith(queued)
    })
  })

  describe('startableSelected', () => {
    it('is true when at least one selected item has a startable status', async () => {
      mockUploads([makeItem('a', 'queued')])
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: 'Select a' }))
      expect(screen.getByTestId('startable').textContent).toBe('true')
    })

    it('is false when selected items are all completed', async () => {
      mockUploads([makeItem('a', 'completed')])
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: 'Select a' }))
      expect(screen.getByTestId('startable').textContent).toBe('false')
    })
  })
})
