import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import RunPanel from '@components/RunPanel'
import { useRunStore } from '@foundation/Stores/runStore'
import useProjectStore from '@foundation/Stores/projectStore'
import type { RunView, RunTestView } from '@foundation/run/runModel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key
  })
}))

const test1 = (id: string, state: RunTestView['state'], extra: Partial<RunTestView> = {}) => ({
  id,
  file: id.startsWith('b') ? 'spec/b_spec.rb' : 'spec/a_spec.rb',
  line: 1,
  description: `desc ${id}`,
  fullName: `full ${id}`,
  state,
  ...extra
})

const makeRun = (over: Partial<RunView> = {}, tests: RunTestView[] = []): RunView => ({
  runId: 'r1',
  projectPath: '/work/shop',
  scope: { kind: 'all' } as RunView['scope'],
  framework: 'rspec',
  workers: 1,
  liveEvents: true,
  startedAt: '2026-10-31T10:00:00.000Z',
  phase: 'running',
  tests: Object.fromEntries(tests.map((t) => [t.id, t])),
  order: tests.map((t) => t.id),
  output: [],
  finished: null,
  ...over
})

const finished = (
  status: 'passed' | 'failed' | 'errored' | 'cancelled',
  total = 2,
  extra = {}
) => ({
  status,
  counts: { total, passed: 0, failed: 0, quarantined: 0, pending: 0, skipped: 0 },
  exitCode: 0,
  finishedAt: '2026-10-31T10:00:05.000Z',
  ...extra
})

const setRun = (run: RunView | null, route = '/tests'): void =>
  useRunStore.setState({
    run,
    origin: run ? { route, label: 'Tests' } : null,
    isActive: run !== null && run.finished === null
  })

beforeEach(() => {
  window.api = { setActiveProject: vi.fn().mockResolvedValue({}) } as unknown as typeof window.api
  useProjectStore.setState({ projectPath: '/work/shop' })
})

describe('RunPanel', () => {
  it('renders nothing for a different routeKey', () => {
    setRun(makeRun())
    const { container } = render(<RunPanel routeKey="/other" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows installing', () => {
    setRun(makeRun({ phase: 'installing' }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.phase.installing')
  })

  it('shows booting with an indeterminate bar', () => {
    setRun(makeRun({ phase: 'booting' }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.phase.booting')
    expect(screen.getByTestId('run-progress').querySelector('[data-indeterminate]')).not.toBeNull()
  })

  it('shows running progress 3 of 5 and Cancel', () => {
    const tests = [
      test1('a1', 'passed'),
      test1('a2', 'failed'),
      test1('a3', 'skipped'),
      test1('b1', 'started'),
      test1('b2', 'queued')
    ]
    setRun(makeRun({}, tests))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.phase.running')
    expect(screen.getByTestId('run-progress')).toHaveTextContent('"done":3,"total":5')
    expect(screen.getByTestId('run-cancel')).toBeInTheDocument()
    expect(screen.queryByTestId('run-again')).toBeNull()
  })

  it('calls cancel', () => {
    const cancel = vi.fn()
    setRun(makeRun())
    useRunStore.setState({ cancel })
    render(<RunPanel routeKey="/tests" />)
    fireEvent.click(screen.getByTestId('run-cancel'))
    expect(cancel).toHaveBeenCalled()
  })

  it('shows passed with Run again and no Re-run failed', () => {
    const onRunAgain = vi.fn()
    setRun(makeRun({ finished: finished('passed') }, [test1('a1', 'passed')]))
    render(<RunPanel routeKey="/tests" onRunAgain={onRunAgain} onRerunFailed={vi.fn()} />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.result.passed')
    expect(screen.queryByTestId('run-cancel')).toBeNull()
    expect(screen.queryByTestId('run-rerun-failed')).toBeNull()
    fireEvent.click(screen.getByTestId('run-again'))
    expect(onRunAgain).toHaveBeenCalled()
  })

  it('shows failed with Re-run failed', () => {
    const onRerunFailed = vi.fn()
    setRun(makeRun({ finished: finished('failed') }, [test1('a1', 'failed')]))
    render(<RunPanel routeKey="/tests" onRunAgain={vi.fn()} onRerunFailed={onRerunFailed} />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.result.failed')
    const btn = screen.getByTestId('run-rerun-failed')
    expect(btn).toHaveAttribute('title', 'run.rerunSerial')
    fireEvent.click(btn)
    expect(onRerunFailed).toHaveBeenCalled()
  })

  it('hides buttons whose handler is absent', () => {
    setRun(makeRun({ finished: finished('failed') }, [test1('a1', 'failed')]))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.queryByTestId('run-again')).toBeNull()
    expect(screen.queryByTestId('run-rerun-failed')).toBeNull()
  })

  it('shows errored', () => {
    setRun(makeRun({ finished: finished('errored', 0) }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.result.errored')
  })

  it('shows cancelled', () => {
    setRun(makeRun({ finished: finished('cancelled') }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.result.cancelled')
  })

  it('shows the degraded notice only without live events', () => {
    setRun(makeRun({ liveEvents: false }))
    const { unmount } = render(<RunPanel routeKey="/tests" />)
    expect(screen.getByText('run.updateReporter')).toBeInTheDocument()
    unmount()
    setRun(makeRun({ liveEvents: true }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.queryByText('run.updateReporter')).toBeNull()
  })

  it('names the other project and offers no Cancel', () => {
    setRun(makeRun({ projectPath: '/work/other' }), '/elsewhere')
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-panel')).toHaveTextContent(
      'run.otherProject {"project":"other"}'
    )
    expect(screen.queryByTestId('run-cancel')).toBeNull()
  })

  it('filters to failed tests', () => {
    setRun(makeRun({}, [test1('a1', 'passed'), test1('a2', 'failed'), test1('b1', 'queued')]))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getAllByTestId('run-test-row')).toHaveLength(3)
    fireEvent.click(within(screen.getByTestId('run-filter')).getByText('run.filter.failed'))
    const rows = screen.getAllByTestId('run-test-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('desc a2')
  })

  it('shows worker badges and attempts only when relevant', () => {
    const tests = [test1('a1', 'passed', { worker: 2, attempt: 2, durationMs: 1500 })]
    setRun(makeRun({ workers: 3 }, tests))
    const { unmount } = render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-test-row')).toHaveTextContent('w2')
    unmount()
    setRun(makeRun({ workers: 1 }, tests))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-test-row')).not.toHaveTextContent('w2')
  })

  it('keeps output under collapsed technical details with a trimmed note', () => {
    setRun(
      makeRun({
        output: [
          { stream: 'stdout', chunk: 'hello', worker: 1 },
          { stream: 'stderr', chunk: 'plain' }
        ],
        finished: finished('failed', 1, { truncated: true })
      })
    )
    render(<RunPanel routeKey="/tests" />)
    const details = screen.getByTestId('run-tech-details')
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent('[w1] hello')
    expect(details).toHaveTextContent('run.trimmed')
  })
})
