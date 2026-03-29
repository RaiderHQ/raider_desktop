import { render, screen } from '@testing-library/react'
import RecordingDashboard from '@components/RecordingDashboard'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@components/PieChartWidget', () => ({
  default: () => <div data-testid="pie-chart" />
}))

vi.mock('@components/TestResultCard', () => ({
  default: ({ name }: { name: string }) => <div data-testid="result-card">{name}</div>
}))

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
})

const makeRspecOutput = (examples: object[], overrides = {}) =>
  JSON.stringify({
    version: '3.12',
    summary: {
      duration: 1.2,
      example_count: examples.length,
      failure_count: 0,
      pending_count: 0,
      ...overrides
    },
    summary_line: `${examples.length} examples`,
    examples
  })

describe('RecordingDashboard', () => {
  it('shows no-results message when output is empty', () => {
    render(<RecordingDashboard runOutput="" />)
    expect(screen.getByText('dashboard.noRecordingResults.title')).toBeInTheDocument()
  })

  it('shows no-results message when output is invalid JSON', () => {
    render(<RecordingDashboard runOutput="not json" />)
    expect(screen.getByText('dashboard.noRecordingResults.title')).toBeInTheDocument()
  })

  it('renders summary stats when valid JSON is provided', () => {
    const output = makeRspecOutput([
      { id: '1', description: 'passes', status: 'passed', pending_message: null }
    ])
    render(<RecordingDashboard runOutput={output} />)
    expect(screen.getByText('dashboard.overallSummary')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1) // total count
  })

  it('renders a TestResultCard per example', () => {
    const output = makeRspecOutput([
      { id: '1', description: 'test one', status: 'passed', pending_message: null },
      { id: '2', description: 'test two', status: 'failed', pending_message: null }
    ])
    render(<RecordingDashboard runOutput={output} />)
    expect(screen.getByText('test one')).toBeInTheDocument()
    expect(screen.getByText('test two')).toBeInTheDocument()
  })

  it('renders the pie chart', () => {
    const output = makeRspecOutput([
      { id: '1', description: 'passes', status: 'passed', pending_message: null }
    ])
    render(<RecordingDashboard runOutput={output} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })
})
