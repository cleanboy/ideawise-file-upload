import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from './StatusBadge'
import type { UploadStatus } from '../types/uploads'

const ALL_STATUSES: UploadStatus[] = [
  'queued', 'uploading', 'paused', 'completed', 'cancelled', 'failed', 'rejected',
]

describe('StatusBadge', () => {
  it.each(ALL_STATUSES)('renders status "%s" as text with matching CSS class', (status) => {
    const { container } = render(<StatusBadge status={status} />)
    const span = container.querySelector('span')!
    expect(span).toHaveTextContent(status)
    expect(span).toHaveClass(`status--${status}`)
  })
})
