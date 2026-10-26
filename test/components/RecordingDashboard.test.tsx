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

  describe('after a failed run', () => {
    const failing = makeRspecOutput(
      [
        { id: '1', description: 'logs in', status: 'passed', pending_message: null },
        { id: '2', description: 'checks out', status: 'failed', pending_message: null }
      ],
      { failure_count: 1 }
    )

    it('shows the examples when the run also wrote to stderr', () => {
      // What main sends for a non-zero exit with stderr (toRunResult)
      const output = `Test execution failed.\n\n--- STDERR ---\nWARN Selenium [DEPRECATION] {old} is deprecated\n\n--- STDOUT ---\n${failing}`
      render(<RecordingDashboard runOutput={output} runFailed />)
      expect(screen.getByText('logs in')).toBeInTheDocument()
      expect(screen.getByText('checks out')).toBeInTheDocument()
    })

    it('shows the examples when the spec printed text before the results', () => {
      render(<RecordingDashboard runOutput={`Visiting {home}\n${failing}`} runFailed />)
      expect(screen.getByText('checks out')).toBeInTheDocument()
    })

    it('says the run failed, with its output, when there are no results to show', () => {
      const output =
        'Test execution failed.\n\n--- STDERR ---\ncannot load such file -- spec_helper'
      render(<RecordingDashboard runOutput={output} runFailed />)
      expect(screen.getByText('dashboard.runFailed.title')).toBeInTheDocument()
      expect(screen.getByText(/cannot load such file/)).toBeInTheDocument()
      expect(screen.queryByText('dashboard.noRecordingResults.title')).not.toBeInTheDocument()
    })

    it('ignores JSON that is not an rspec result', () => {
      render(<RecordingDashboard runOutput='{"examples": "nope"}' />)
      expect(screen.getByText('dashboard.noRecordingResults.title')).toBeInTheDocument()
    })
  })
})
