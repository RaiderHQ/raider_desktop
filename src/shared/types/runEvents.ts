/**
 * Live test-run contract between the main-process runner and the renderer.
 *
 * Main runs one test run per project at a time, in the active project
 * (appState.projectPath), and streams RunEvents on the `run-event` channel.
 * Failure details (message, trace, attachments) are not in the events: once
 * `run:finished` arrives, read raider_reporter's run.json for them, joining on
 * `run:example.id` === `results[].identifier`.
 */

export type RunScope =
  | { kind: 'all' }
  /** Project-relative POSIX spec or feature paths; each must be a listed project test file. */
  | { kind: 'files'; files: string[] }
  /** "spec/a_spec.rb:12" for run-one / run-line; the file part must be a listed project test file. */
  | { kind: 'locations'; locations: string[] }
  /** Each tag must match /^[A-Za-z0-9_:-]+$/. */
  | { kind: 'tags'; tags: string[] }

export interface RunRequest {
  scope: RunScope
  /** Worker count for a parallel run; undefined runs serially. */
  workers?: number
  /** Validated with isValidRubyCommand in main. */
  rubyCommand: string
}

export type ExampleStatus = 'started' | 'passed' | 'failed' | 'pending' | 'skipped'

export type RunFinishedStatus = 'passed' | 'failed' | 'errored' | 'cancelled'

export interface RunCounts {
  total: number
  passed: number
  failed: number
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
      /** 1-based; a retried example emits one event per attempt. */
      attempt?: number
      worker?: number
    }
  | {
      type: 'run:finished'
      runId: string
      finishedAt: string
      exitCode: number | null
      /** `errored`: the process failed before or outside examples (load error, bundler); run:output has why. */
      status: RunFinishedStatus
      counts: RunCounts
      /** True when retained output passed the ~2 MB cap and the oldest chunks were trimmed. */
      truncated?: boolean
    }

export type StartRunResult = { runId: string } | { error: 'busy' | string }

export interface ActiveRun {
  runId: string
  request: RunRequest
  /** Events so far (output may be coalesced). After a run finishes, the last run is kept until the next starts. */
  events: RunEvent[]
}

/** Shape of the preload API for live runs (window.api). */
export interface RunApi {
  /** Returns { error: 'busy' } while a run is active in the project. */
  startRun: (request: RunRequest) => Promise<StartRunResult>
  cancelRun: (runId: string) => Promise<void>
  getActiveRun: () => Promise<ActiveRun | null>
  /** Subscribes to the `run-event` channel; returns an unsubscribe function. */
  onRunEvent: (callback: (event: RunEvent) => void) => () => void
}
