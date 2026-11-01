/**
 * Live test-run contract between the main-process runner and the renderer.
 *
 * Main runs one test run at a time (per app), in the active project
 * (appState.projectPath), and streams RunEvents on the `run-event` channel.
 * Failure details (message, trace, attachments) are not in the events: once
 * `run:finished` arrives, read raider_reporter's run.json for them, joining on
 * `run:example.id` === `results[].identifier`.
 */

export type RunScope =
  | { kind: 'all' }
  /** Project-relative POSIX spec or feature paths; each must be a project test file (spec, or feature in Cucumber projects). */
  | { kind: 'files'; files: string[] }
  /** "spec/a_spec.rb:12" for run-one / run-line; the file part must be a project test file (spec, or feature in Cucumber projects). */
  | { kind: 'locations'; locations: string[] }
  /** Each tag must match /^[A-Za-z0-9_:-]+$/. */
  | { kind: 'tags'; tags: string[] }

export interface RunRequest {
  scope: RunScope
  /** Worker count for a parallel run; undefined runs serially. */
  workers?: number
  /** Validated with isValidRubyCommand in main. */
  rubyCommand: string
  /** When true, a quarantined failure fails the run; default false (user setting). */
  quarantinedFails?: boolean
}

export type ExampleStatus = 'started' | 'passed' | 'failed' | 'quarantined' | 'pending' | 'skipped'

export type RunPhase = 'installing' | 'booting' | 'running'

export interface PlannedTest {
  id: string
  file: string
  line: number | null
  description: string
  fullName: string
}

export interface RunDefaults {
  /** clamp(floor(cpus / 2), 1, 4) */
  recommendedWorkers: number
  maxWorkers: number
}

export type RunFinishedStatus = 'passed' | 'failed' | 'errored' | 'cancelled'

export interface RunCounts {
  total: number
  passed: number
  failed: number
  quarantined: number
  pending: number
  skipped: number
}

export type RunEvent =
  | {
      type: 'run:started'
      runId: string
      startedAt: string
      framework: 'rspec' | 'cucumber'
      scope: RunScope
      workers: number
      /** False when the project's raider_reporter is older than 0.11: no phases past booting, no plan, no per-test events. */
      liveEvents: boolean
    }
  | {
      type: 'run:phase'
      runId: string
      /** installing only when gems are missing; booting after spawn; running on the first run:planned. */
      phase: RunPhase
    }
  | {
      type: 'run:planned'
      runId: string
      /** One per worker; in a parallel run the total grows until every worker has planned. */
      tests: PlannedTest[]
      worker?: number
    }
  | {
      type: 'run:output'
      runId: string
      stream: 'stdout' | 'stderr'
      /** Batched roughly every 50 ms. */
      chunk: string
      /** Set only when the run has more than one worker. */
      worker?: number
    }
  | {
      type: 'run:example'
      runId: string
      /** raider_reporter's identifier; equals run.json results[].identifier. */
      id: string
      /** Project-relative POSIX path, no leading "./". */
      file: string
      line: number | null
      /** The example's own description (the `it` / scenario name). */
      description: string
      fullName: string
      status: ExampleStatus
      durationMs?: number
      /**
       * 1-based. Cucumber --retry emits one event per attempt; RSpec (rspec-retry)
       * emits a single final event with the total attempt count.
       */
      attempt?: number
      worker?: number
    }
  | {
      type: 'run:finished'
      runId: string
      finishedAt: string
      exitCode: number | null
      /**
       * `errored`: the process failed before or outside examples (load error, bundler, a
       * non-zero exit, crash or kill before any result arrived); run:output has why.
       */
      status: RunFinishedStatus
      counts: RunCounts
      /** True when retained output passed the ~2 MB cap and the oldest chunks were trimmed. */
      truncated?: boolean
    }

export type StartRunResult = { runId: string } | { error: 'busy' | string }

export interface ActiveRun {
  runId: string
  /** One run at a time per app; the project it runs in. */
  projectPath: string
  request: RunRequest
  /** Events so far (output may be coalesced). After a run finishes, the last run is kept until the next starts. */
  events: RunEvent[]
}

/** Shape of the preload API for live runs (window.api). */
export interface RunApi {
  /** Returns { error: 'busy' } while any run is active. */
  startRun: (request: RunRequest) => Promise<StartRunResult>
  cancelRun: (runId: string) => Promise<void>
  getActiveRun: () => Promise<ActiveRun | null>
  getRunDefaults: () => Promise<RunDefaults>
  /** Subscribes to the `run-event` channel; returns an unsubscribe function. */
  onRunEvent: (callback: (event: RunEvent) => void) => () => void
}
