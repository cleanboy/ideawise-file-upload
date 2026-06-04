import { render, screen } from '@testing-library/react-native'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['queued',    'Queued'],
    ['uploading', 'Uploading'],
    ['paused',    'Paused'],
    ['completed', 'Done'],
    ['cancelled', 'Cancelled'],
    ['failed',    'Failed'],
    ['rejected',  'Rejected'],
  ] as const)('renders "%s" label for %s status', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeOnTheScreen()
  })
})
