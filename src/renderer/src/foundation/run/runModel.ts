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

/** Retained output is capped at this many chars, mirroring the main process's cap. */
export const OUTPUT_CAP = 2 * 1024 * 1024

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
  /** Total chars held in output */
  outputSize: number
  /** True once the oldest output was dropped to stay under OUTPUT_CAP */
  outputTrimmed: boolean
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
      outputSize: 0,
      outputTrimmed: false,
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
    case 'run:output': {
      const output = view.output.concat({
        stream: event.stream,
        chunk: event.chunk,
        ...(event.worker !== undefined ? { worker: event.worker } : {})
      })
      let outputSize = view.outputSize + event.chunk.length
      let drop = 0
      while (outputSize > OUTPUT_CAP && drop < output.length) {
        outputSize -= output[drop++].chunk.length
      }
      return {
        ...view,
        output: drop > 0 ? output.slice(drop) : output,
        outputSize,
        outputTrimmed: view.outputTrimmed || drop > 0
      }
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

const REASON_MAX = 200

const firstLine = (view: RunView, stream: 'stdout' | 'stderr'): string | null => {
  // Join first: a line can be split across chunks
  const text = view.output
    .filter((o) => o.stream === stream)
    .map((o) => o.chunk)
    .join('')
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '')
  return line === undefined ? null : line.trim().slice(0, REASON_MAX)
}

/** Why a run couldn't run: the first non-blank stderr line, else the first stdout one. */
export function errorReason(view: RunView): string | null {
  return firstLine(view, 'stderr') ?? firstLine(view, 'stdout')
}

export function progress(view: RunView): { done: number; total: number } {
  const done = Object.values(view.tests).filter((t) => isTerminal(t.state)).length
  const { finished } = view
  if (!finished) return { done, total: view.order.length }
  // Without per-test events the final counts are all there is
  if (view.order.length === 0) {
    const c = finished.counts
    return { done: c.passed + c.failed + c.quarantined + c.pending + c.skipped, total: c.total }
  }
  return { done, total: finished.counts.total }
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
