import type {
  ActiveRun,
  ExampleStatus,
  RunCounts,
  RunEvent,
  RunFinishedStatus,
  RunPhase,
  RunRequest
} from '@shared/types/runEvents'
import type { Framework } from './runCommand'

/** Retained run:output is capped at this many chars (counted on chunk length). */
const OUTPUT_CAP = 2 * 1024 * 1024

type OutputEvent = Extract<RunEvent, { type: 'run:output' }>
type Result = Exclude<ExampleStatus, 'started'>

const hasResults = (c: RunCounts): boolean =>
  c.passed + c.failed + c.quarantined + c.pending + c.skipped > 0

/** The run's final status; rules apply in order. */
export function finishStatus(input: {
  cancelled: boolean
  liveEvents: boolean
  planned: boolean
  exitCode: number | null
  counts: RunCounts
  quarantinedFails: boolean
}): RunFinishedStatus {
  const { exitCode, counts } = input
  if (input.cancelled) return 'cancelled'
  if (input.liveEvents && !input.planned) return 'errored'
  // A non-zero (or signal) exit before any result: a crash, not a test failure
  if (exitCode !== 0 && !hasResults(counts)) return 'errored'
  if (counts.failed > 0) return 'failed'
  if (input.quarantinedFails && counts.quarantined > 0) return 'failed'
  const quarantineOnlyExit = exitCode === 1 && counts.failed === 0 && counts.quarantined > 0
  if (exitCode !== 0 && !quarantineOnlyExit) return 'failed'
  return 'passed'
}

export interface RunSessionOptions {
  runId: string
  request: RunRequest
  projectPath: string
  framework: Framework
  workers: number
  liveEvents: boolean
  emit: (event: RunEvent) => void
  now?: () => Date
}

/** Pure state for one live run: phases, counts, buffered output and the final status. No process or timers. */
export class RunSession {
  private readonly retained: RunEvent[] = []
  private readonly latest = new Map<string, Result>()
  private readonly pending: { stream: 'stdout' | 'stderr'; chunk: string; worker?: number }[] = []
  private readonly now: () => Date
  private currentPhase: RunPhase | null = null
  private plannedTotal = 0
  private planned = false
  private retainedOutput = 0
  private trimmed = false
  private cancelled = false
  private finished = false
  private liveEvents: boolean

  constructor(private readonly opts: RunSessionOptions) {
    this.now = opts.now ?? ((): Date => new Date())
    this.liveEvents = opts.liveEvents
  }

  start(): void {
    const { runId, request, framework, workers, liveEvents } = this.opts
    this.push({
      type: 'run:started',
      runId,
      startedAt: this.now().toISOString(),
      framework,
      scope: request.scope,
      workers,
      liveEvents
    })
  }

  phase(phase: RunPhase): void {
    if (this.finished || phase === this.currentPhase) return
    this.currentPhase = phase
    this.push({ type: 'run:phase', runId: this.opts.runId, phase })
  }

  apply(events: RunEvent[]): void {
    if (this.finished) return
    for (const event of events) {
      if (event.type === 'run:planned') {
        this.plannedTotal += event.tests.length
        if (!this.planned) {
          this.planned = true
          this.phase('running')
        }
      } else if (event.type === 'run:example' && event.status !== 'started') {
        this.latest.set(event.id, event.status)
      }
      this.push(event)
    }
  }

  output(stream: 'stdout' | 'stderr', chunk: string, worker?: number): void {
    if (this.finished || chunk === '') return
    const last = this.pending[this.pending.length - 1]
    if (last && last.stream === stream && last.worker === worker) last.chunk += chunk
    else this.pending.push({ stream, chunk, worker })
  }

  /** Turns buffered output into run:output events; the caller's 50 ms timer. */
  flushOutput(): void {
    if (this.finished) return
    this.drainOutput()
  }

  /**
   * Corrects live/degraded mode for the final status after run:started went out, e.g.
   * when the bundle install wrote a Gemfile.lock that wasn't there before.
   */
  setLiveEvents(liveEvents: boolean): void {
    this.liveEvents = liveEvents
  }

  /** Only records the intent; finish() decides the status. */
  requestCancel(): void {
    this.cancelled = true
  }

  finish(exitCode: number | null, fallbackCounts?: RunCounts): void {
    if (this.finished) return
    this.drainOutput()
    this.finished = true
    const counts = this.latest.size === 0 && fallbackCounts ? fallbackCounts : this.counts()
    const status = finishStatus({
      cancelled: this.cancelled,
      liveEvents: this.liveEvents,
      planned: this.planned,
      exitCode,
      counts,
      quarantinedFails: this.opts.request.quarantinedFails === true
    })
    this.push({
      type: 'run:finished',
      runId: this.opts.runId,
      finishedAt: this.now().toISOString(),
      exitCode,
      status,
      counts,
      ...(this.trimmed ? { truncated: true } : {})
    })
  }

  snapshot(): ActiveRun {
    return {
      runId: this.opts.runId,
      projectPath: this.opts.projectPath,
      request: this.opts.request,
      events: [...this.retained]
    }
  }

  private counts(): RunCounts {
    const counts: RunCounts = {
      total: this.planned ? this.plannedTotal : this.latest.size,
      passed: 0,
      failed: 0,
      quarantined: 0,
      pending: 0,
      skipped: 0
    }
    for (const status of this.latest.values()) counts[status] += 1
    return counts
  }

  private drainOutput(): void {
    for (const { stream, chunk, worker } of this.pending.splice(0)) {
      const event: OutputEvent = { type: 'run:output', runId: this.opts.runId, stream, chunk }
      if (worker !== undefined) event.worker = worker
      this.push(event)
    }
  }

  /** Emits live (never trimmed) and retains, trimming the oldest output past the cap. */
  private push(event: RunEvent): void {
    this.retained.push(event)
    if (event.type === 'run:output') {
      this.retainedOutput += event.chunk.length
      while (this.retainedOutput > OUTPUT_CAP) {
        const index = this.retained.findIndex((e) => e.type === 'run:output')
        if (index === -1) break
        this.retainedOutput -= (this.retained[index] as OutputEvent).chunk.length
        this.retained.splice(index, 1)
        this.trimmed = true
      }
    }
    this.opts.emit(event)
  }
}
