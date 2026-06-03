import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('renders with the given aria-label', () => {
    const { container } = render(<ProgressBar label="Upload progress" value={50} />)
    expect(container.querySelector('[aria-label="Upload progress"]')).toBeInTheDocument()
  })

  it('sets inner span width to the given percentage', () => {
    const { container } = render(<ProgressBar label="Upload" value={75} />)
    const span = container.querySelector('.progress-bar span') as HTMLSpanElement
    expect(span.style.width).toBe('75%')
  })

  it('renders 0% width when value is 0', () => {
    const { container } = render(<ProgressBar label="Upload" value={0} />)
    const span = container.querySelector('.progress-bar span') as HTMLSpanElement
    expect(span.style.width).toBe('0%')
  })

  it('renders 100% width when value is 100', () => {
    const { container } = render(<ProgressBar label="Upload" value={100} />)
    const span = container.querySelector('.progress-bar span') as HTMLSpanElement
    expect(span.style.width).toBe('100%')
  })
})
