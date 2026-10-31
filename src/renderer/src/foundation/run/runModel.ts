import type {
  ActiveRun,
  ExampleStatus,
  RunCounts,
  RunEvent,
  RunFinishedStatus,
  RunPhase,
  RunScope
} from '@shared/types/runEvents'

export type TestState = 'queued' | ExampleStatus

export interface RunTestView {
  id: string
  file: string
  line: number | null
  description: string
  fullName: string
  state: TestState
  worker?: number
  durationMs?: number
  attempt?: number
}

export interface RunView {
  runId: string
  projectPath: string
  scope: RunScope
  framework: 'rspec' | 'cucumber'
  workers: number
  liveEvents: boolean
  startedAt: string
  phase: RunPhase | null
  tests: Record<string, RunTestView>
  /** First-seen id order */
  order: string[]
  output: { stream: 'stdout' | 'stderr'; chunk: string; worker?: number }[]
  finished: {
    status: RunFinishedStatus
    counts: RunCounts
    exitCode: number | null
    finishedAt: string
    truncated?: boolean
  } | null
}

const isTerminal = (state: TestState): boolean => state !== 'queued' && state !== 'started'

const withTest = (view: RunView, test: RunTestView): RunView => ({
  ...view,
  tests: { ...view.tests, [test.id]: test },
  order: test.id in view.tests ? view.order : [...view.order, test.id]
})

/** Pure: folds one event into the view. A foreign runId is ignored; run:started replaces the view. */
export function reduceRun(
  view: RunView | null,
  event: RunEvent,
  projectPath?: string
): RunView | null {
  if (event.type === 'run:started') {
    return {
      runId: event.runId,
      projectPath: projectPath ?? '',
      scope: event.scope,
      framework: event.framework,
      workers: event.workers,
      liveEvents: event.liveEvents,
      startedAt: event.startedAt,
      phase: null,
      tests: {},
      order: [],
      output: [],
      finished: null
    }
  }
  if (!view || event.runId !== view.runId) return view

  switch (event.type) {
    case 'run:phase':
      return { ...view, phase: event.phase }
    case 'run:planned': {
      let next = view
      for (const planned of event.tests) {
        if (planned.id in next.tests) continue
        next = withTest(next, { ...planned, state: 'queued' })
      }
      return next
    }
    case 'run:output':
      return {
        ...view,
        output: [
          ...view.output,
          {
            stream: event.stream,
            chunk: event.chunk,
            ...(event.worker !== undefined ? { worker: event.worker } : {})
          }
        ]
      }
    case 'run:example': {
      const existing = view.tests[event.id]
      // A late 'started' (events can arrive out of order) must not undo a result
      const state: TestState =
        event.status === 'started' && existing && isTerminal(existing.state)
          ? existing.state
          : event.status
      return withTest(view, {
        id: event.id,
        file: event.file,
        line: event.line,
        description: event.description,
        fullName: event.fullName,
        state,
        worker: event.worker ?? existing?.worker,
        durationMs: event.durationMs ?? existing?.durationMs,
        attempt: event.attempt ?? existing?.attempt
      })
    }
    case 'run:finished': {
      let tests = view.tests
      if (event.status === 'cancelled') {
        tests = Object.fromEntries(
          Object.entries(view.tests).map(([id, test]) => [
            id,
            isTerminal(test.state) ? test : { ...test, state: 'skipped' as const }
          ])
        )
      }
      return {
        ...view,
        tests,
        finished: {
          status: event.status,
          counts: event.counts,
          exitCode: event.exitCode,
          finishedAt: event.finishedAt,
          ...(event.truncated !== undefined ? { truncated: event.truncated } : {})
        }
      }
    }
  }
}

/** Rebuilds a view from the main process's snapshot of the run so far. */
export function viewFromActiveRun(active: ActiveRun): RunView | null {
  let view: RunView | null = null
  for (const event of active.events) view = reduceRun(view, event, active.projectPath)
  return view
}

export function progress(view: RunView): { done: number; total: number } {
  const done = Object.values(view.tests).filter((t) => isTerminal(t.state)).length
  return { done, total: view.finished ? view.finished.counts.total : view.order.length }
}

/** The state of a file's tests in the current run, or null when the run has none in it. */
export function fileStatus(
  view: RunView | null,
  file: string
): 'running' | 'passed' | 'failed' | null {
  if (!view) return null
  const tests = view.order.map((id) => view.tests[id]).filter((t) => t.file === file)
  if (tests.length === 0) return null
  // After the run ends, a test that never reported is no longer running
  if (!view.finished && tests.some((t) => !isTerminal(t.state))) return 'running'
  if (tests.some((t) => t.state === 'failed')) return 'failed'
  return tests.some((t) => isTerminal(t.state)) ? 'passed' : null
}
