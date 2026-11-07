import { act, render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import RunPanel from '@components/RunPanel'
import { useRunStore } from '@foundation/Stores/runStore'
import useProjectStore from '@foundation/Stores/projectStore'
import type { RunView, RunTestView } from '@foundation/run/runModel'

vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))

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
  outputSize: 0,
  outputTrimmed: false,
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
  useRunStore.setState({ resultsCollapsed: false, hiddenRunStartedAt: null })
})

describe('RunPanel', () => {
  it('minimises to the summary line, and stays minimised for the session', () => {
    setRun(makeRun({ phase: null, finished: finished('passed', 1) }, [test1('a1', 'passed')]))
    const { unmount } = render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-filter')).toBeInTheDocument()
    const toggle = screen.getByTestId('run-collapse')
    expect(toggle).toHaveAttribute('aria-label', 'run.minimiseResults')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)
    expect(screen.queryByTestId('run-filter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-tech-details')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-test-row')).not.toBeInTheDocument()
    expect(screen.getByTestId('run-phase')).toHaveTextContent('run.result.passed')
    expect(screen.getByTestId('run-collapse')).toHaveAttribute('aria-label', 'run.showResults')
    expect(screen.getByTestId('run-collapse')).toHaveAttribute('aria-expanded', 'false')
    unmount()

    // Another panel later in the session is minimised too
    render(<RunPanel routeKey="/tests" />)
    expect(screen.queryByTestId('run-filter')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('run-collapse'))
    expect(screen.getByTestId('run-filter')).toBeInTheDocument()
    expect(screen.getByTestId('run-tech-details')).toBeInTheDocument()
  })

  it('keeps the reason a run could not run in view while minimised', () => {
    setRun(
      makeRun({
        output: [{ stream: 'stderr', chunk: '\nCould not find gem\n' }],
        finished: finished('errored', 0)
      })
    )
    render(<RunPanel routeKey="/tests" />)
    fireEvent.click(screen.getByTestId('run-collapse'))
    expect(screen.getByTestId('run-error-reason')).toHaveTextContent('Could not find gem')
    expect(screen.queryByTestId('run-filter')).not.toBeInTheDocument()
    const toggle = screen.getByTestId('run-collapse')
    expect(toggle).toHaveAttribute('aria-controls')
  })

  it('stays hidden once Record hid it, until a later run', () => {
    setRun(makeRun({ phase: null, finished: finished('passed', 1) }, [test1('a1', 'passed')]))
    const { container } = render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
    act(() => useRunStore.getState().hideCurrentRun())
    expect(container).toBeEmptyDOMElement()
    act(() => setRun(makeRun({ runId: 'r2', startedAt: '2026-10-31T11:00:00.000Z' })))
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
  })

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

  it('Cancel has a tooltip on focus', () => {
    setRun(makeRun())
    render(<RunPanel routeKey="/tests" />)
    fireEvent.focus(screen.getByTestId('run-cancel'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.runPanel.cancel')
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

  it('offers Re-run failed for a degraded run using the final counts', () => {
    const f = finished('failed', 5)
    f.counts.failed = 2
    setRun(makeRun({ liveEvents: false, finished: f }))
    render(<RunPanel routeKey="/tests" onRerunFailed={vi.fn()} />)
    expect(screen.getByTestId('run-rerun-failed')).toBeInTheDocument()
  })

  it('shows an indeterminate bar and no fraction for an active run with no tests yet', () => {
    setRun(makeRun({ liveEvents: false }))
    render(<RunPanel routeKey="/tests" />)
    const progressEl = screen.getByTestId('run-progress')
    expect(progressEl.querySelector('[data-indeterminate]')).not.toBeNull()
    expect(progressEl).not.toHaveTextContent('run.progress')
  })

  it('labels row states in plain words', () => {
    setRun(makeRun({}, [test1('a1', 'started')]))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-test-row')).toHaveTextContent('run.state.started')
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

  it('says so when the chosen filter matches nothing, instead of an empty list', () => {
    setRun(makeRun({}, [test1('a1', 'passed'), test1('a2', 'passed')]))
    render(<RunPanel routeKey="/tests" />)
    const filter = within(screen.getByTestId('run-filter'))
    expect(screen.queryByTestId('run-filter-empty')).toBeNull()
    fireEvent.click(filter.getByText('run.filter.failed'))
    expect(screen.queryAllByTestId('run-test-row')).toHaveLength(0)
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.failed')
    fireEvent.click(filter.getByText('run.filter.running'))
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.running')
    fireEvent.click(filter.getByText('run.filter.queued'))
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.queued')
  })

  it('says "no results yet" under All while a run has no tests listed', () => {
    setRun(makeRun({}, []))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.all')
  })

  it('does not give a verdict on failures before the run has started its tests', () => {
    setRun(makeRun({ phase: 'booting' }, []))
    render(<RunPanel routeKey="/tests" />)
    fireEvent.click(within(screen.getByTestId('run-filter')).getByText('run.filter.failed'))
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.failedSoFar')
  })

  it('points at the technical details when a run failed but lists no rows (old reporter)', () => {
    const finished = {
      status: 'failed' as const,
      finishedAt: '2026-10-31T10:01:00.000Z',
      counts: { passed: 1, failed: 2, pending: 0, skipped: 0, quarantined: 0 },
      truncated: false
    }
    setRun(makeRun({ liveEvents: false, finished } as Partial<RunView>, []))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.noneListed')
    fireEvent.click(within(screen.getByTestId('run-filter')).getByText('run.filter.failed'))
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent(
      'run.filterEmpty.failedUnlisted'
    )
  })

  it('says no tests ran once a run is over with nothing listed', () => {
    const finished = {
      status: 'cancelled' as const,
      finishedAt: '2026-10-31T10:01:00.000Z',
      counts: { passed: 0, failed: 0, pending: 0, skipped: 0, quarantined: 0 },
      truncated: false
    }
    setRun(makeRun({ finished } as Partial<RunView>, []))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-filter-empty')).toHaveTextContent('run.filterEmpty.noneListed')
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

  it('renders the output only once technical details are opened', () => {
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
    const details = screen.getByTestId('run-tech-details') as HTMLDetailsElement
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    expect(details).not.toHaveTextContent('[w1] hello')
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(details).toHaveTextContent('[w1] hello')
    expect(details).toHaveTextContent('run.trimmed')
  })

  it('notes output trimmed in the app while the run is still going', () => {
    setRun(makeRun({ outputTrimmed: true }))
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-tech-details')).toHaveTextContent('run.trimmed')
  })

  it("shows nothing for another project's finished run", () => {
    setRun(makeRun({ projectPath: '/work/other', finished: finished('passed') }))
    const { container } = render(<RunPanel routeKey="/tests" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gives the reason a run could not run', () => {
    setRun(
      makeRun({
        output: [{ stream: 'stderr', chunk: '\nCould not find gem\nmore detail\n' }],
        finished: finished('errored', 0)
      })
    )
    render(<RunPanel routeKey="/tests" />)
    expect(screen.getByTestId('run-error-reason')).toHaveTextContent(/^Could not find gem$/)
  })

  it('gives no reason for a run that failed normally', () => {
    setRun(
      makeRun({
        output: [{ stream: 'stderr', chunk: 'boom\n' }],
        finished: finished('failed', 1)
      })
    )
    render(<RunPanel routeKey="/tests" />)
    expect(screen.queryByTestId('run-error-reason')).toBeNull()
  })

  it('shows a run restored after a reload on Overview, with Cancel', async () => {
    useRunStore.setState({ run: null, origin: null, isActive: false })
    const restored = makeRun()
    window.api = {
      getActiveRun: vi.fn().mockResolvedValue({
        runId: restored.runId,
        projectPath: '/work/shop',
        request: { scope: { kind: 'all' }, rubyCommand: 'ruby' },
        events: [
          {
            type: 'run:started',
            runId: restored.runId,
            startedAt: restored.startedAt,
            framework: 'rspec',
            scope: { kind: 'all' },
            workers: 1,
            liveEvents: true
          },
          { type: 'run:phase', runId: restored.runId, phase: 'running' }
        ]
      })
    } as unknown as typeof window.api
    await useRunStore.getState().restore()
    render(<RunPanel routeKey="/overview" />)
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
    expect(screen.getByTestId('run-cancel')).toBeInTheDocument()
  })
})
