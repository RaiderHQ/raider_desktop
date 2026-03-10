import { render, screen } from '@testing-library/react'
import PieChartWidget from '@components/PieChartWidget'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// recharts needs ResizeObserver
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
})

describe('PieChartWidget', () => {
  it('renders the breakdown title', () => {
    render(<PieChartWidget passed={5} failed={2} skipped={1} />)
    expect(screen.getByText('testResults.breakdown')).toBeInTheDocument()
  })

  it('renders legend entries for non-zero counts', () => {
    render(<PieChartWidget passed={3} failed={1} skipped={0} />)
    // Should show passed and failed in legend, but not skipped (0)
    expect(screen.getByText(/testResults\.passed/)).toBeInTheDocument()
    expect(screen.getByText(/testResults\.failed/)).toBeInTheDocument()
  })

  it('omits legend entry for zero counts', () => {
    render(<PieChartWidget passed={5} failed={0} skipped={0} />)
    expect(screen.queryByText(/testResults\.failed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/testResults\.skipped/)).not.toBeInTheDocument()
  })
})
