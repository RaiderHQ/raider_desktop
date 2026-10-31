import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import '@testing-library/jest-dom'
import RunIndicator from '@components/RunIndicator'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunView } from '@foundation/run/runModel'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, vals?: Record<string, unknown>) => string } => ({
    t: (key: string, vals?: Record<string, unknown>): string =>
      vals && Object.keys(vals).length ? `${key} ${JSON.stringify(vals)}` : key
  })
}))

const Where = (): JSX.Element => <div data-testid="where">{useLocation().pathname}</div>

const makeRun = (overrides: Partial<RunView> = {}): RunView => ({
  runId: 'r1',
  projectPath: '/p',
  scope: { kind: 'all' },
  framework: 'rspec',
  workers: 1,
  liveEvents: true,
  startedAt: '2026-01-01T00:00:00Z',
  phase: 'running',
  tests: {},
  order: [],
  output: [],
  finished: null,
  ...overrides
})

const withTests = (states: ('passed' | 'queued')[], overrides: Partial<RunView> = {}): RunView =>
  makeRun({
    order: states.map((_, i) => `t${i}`),
    tests: Object.fromEntries(
      states.map((state, i) => [
        `t${i}`,
        { id: `t${i}`, file: 'a.rb', line: 1, description: 'd', fullName: 'd', state }
      ])
    ),
    ...overrides
  })

const renderAt = (path: string): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RunIndicator />
      <Where />
    </MemoryRouter>
  )
}

const origin = { route: '/tests', label: 'Tests' }

beforeEach(() => {
  vi.useFakeTimers()
  useRunStore.setState({ run: null, origin: null, isActive: false })
})
afterEach(() => vi.useRealTimers())

describe('RunIndicator', () => {
  it('is hidden with no run', () => {
    renderAt('/settings')
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })

  it('shows progress while running', () => {
    useRunStore.setState({
      run: withTests(['passed', 'passed', 'passed', 'queued', 'queued']),
      origin,
      isActive: true
    })
    renderAt('/settings')
    expect(screen.getByTestId('run-indicator')).toHaveTextContent(
      'run.indicator.running {"done":3,"total":5}'
    )
  })

  it('shows the phase without a fraction when the total is unknown', () => {
    useRunStore.setState({ run: makeRun({ phase: 'booting' }), origin, isActive: true })
    renderAt('/settings')
    expect(screen.getByTestId('run-indicator')).toHaveTextContent('run.phase.booting')
    expect(screen.getByTestId('run-indicator')).not.toHaveTextContent('0')
  })

  it('is hidden on the origin route', () => {
    useRunStore.setState({ run: makeRun(), origin, isActive: true })
    renderAt('/tests')
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })

  it('is hidden on an Overview sub-route when the run started on Overview', () => {
    useRunStore.setState({
      run: makeRun(),
      origin: { route: '/overview', label: 'This project' },
      isActive: true
    })
    renderAt('/overview/tests')
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })

  it('shows on a sub-route of any other origin', () => {
    useRunStore.setState({ run: makeRun(), origin, isActive: true })
    renderAt('/tests/abc')
    expect(screen.getByTestId('run-indicator')).toBeInTheDocument()
  })

  it('treats /overview as the origin when it is unknown', () => {
    useRunStore.setState({ run: makeRun(), origin: null, isActive: true })
    renderAt('/overview')
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })

  it('navigates to the origin on click', () => {
    useRunStore.setState({ run: makeRun(), origin, isActive: true })
    renderAt('/settings')
    fireEvent.click(screen.getByRole('button', { name: 'run.indicator.show' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/tests')
  })

  it('navigates to /overview when the origin is unknown', () => {
    useRunStore.setState({ run: makeRun(), origin: null, isActive: true })
    renderAt('/settings')
    fireEvent.click(screen.getByTestId('run-indicator'))
    expect(screen.getByTestId('where')).toHaveTextContent('/overview')
  })

  it('shows the result for 10 seconds after finishing, then hides', () => {
    useRunStore.setState({ run: makeRun(), origin, isActive: true })
    renderAt('/settings')
    act(() => {
      useRunStore.setState({
        run: makeRun({
          finished: {
            status: 'failed',
            counts: { total: 5, passed: 3, failed: 2, quarantined: 0, pending: 0, skipped: 0 },
            exitCode: 1,
            finishedAt: '2026-01-01T00:01:00Z'
          }
        }),
        isActive: false
      })
    })
    expect(screen.getByTestId('run-indicator')).toHaveTextContent('run.indicator.failed {"count":2}')
    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(screen.getByTestId('run-indicator')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })

  it('does not show an already-finished run it never saw running', () => {
    useRunStore.setState({
      run: makeRun({
        finished: {
          status: 'passed',
          counts: { total: 1, passed: 1, failed: 0, quarantined: 0, pending: 0, skipped: 0 },
          exitCode: 0,
          finishedAt: '2026-01-01T00:01:00Z'
        }
      }),
      origin,
      isActive: false
    })
    renderAt('/settings')
    expect(screen.queryByTestId('run-indicator')).toBeNull()
  })
})
