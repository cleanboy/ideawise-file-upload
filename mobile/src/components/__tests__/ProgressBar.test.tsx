import { render } from '@testing-library/react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'
import { ProgressBar } from '../ProgressBar'

function getFillStyle(progress: number): object[] {
  const { toJSON } = render(<ProgressBar progress={progress} />)
  const track = toJSON() as ReactTestRendererJSON
  const fill = (track.children as ReactTestRendererJSON[])[0]
  // StyleSheet.create returns an integer ID; the inline object is the second element
  return fill.props.style as object[]
}

describe('ProgressBar', () => {
  it('renders without crashing', () => {
    render(<ProgressBar progress={50} />)
  })

  it('sets fill width to the given progress percentage', () => {
    expect(getFillStyle(75)).toContainEqual(expect.objectContaining({ width: '75%' }))
  })

  it('clamps negative progress to 0%', () => {
    expect(getFillStyle(-20)).toContainEqual(expect.objectContaining({ width: '0%' }))
  })

  it('clamps progress above 100 to 100%', () => {
    expect(getFillStyle(150)).toContainEqual(expect.objectContaining({ width: '100%' }))
  })

  it('uses the default blue color when no color prop is given', () => {
    expect(getFillStyle(50)).toContainEqual(expect.objectContaining({ backgroundColor: '#2563eb' }))
  })

  it('uses a custom color when provided', () => {
    const { toJSON } = render(<ProgressBar progress={50} color="#ca8a04" />)
    const track = toJSON() as ReactTestRendererJSON
    const fill = (track.children as ReactTestRendererJSON[])[0]
    expect(fill.props.style as object[]).toContainEqual(
      expect.objectContaining({ backgroundColor: '#ca8a04' }),
    )
  })
})
