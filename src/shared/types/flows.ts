// The Flows tab's view of `raider flow` (ruby_raider 4.1+): what main reads from the gem's
// JSON output. The schedule types live in ./schedules.

import type { FlowLastRun } from './schedules'

/** A flow run's results, from the gem's run log (runs.jsonl) */
export interface FlowLastResults {
  /** Project-relative `flow-results/<name>/<stamp>`, checked to be that flow's own folder */
  resultsDir: string
  finishedAt: string
  status: FlowLastRun['status']
}

export interface GemFlow {
  name: string
  file: string
  last: FlowLastRun | null
}

export type FlowsStatus =
  | { state: 'ready' }
  | { state: 'needs-setup' }
  | { state: 'unsupported'; reason: 'gem' | 'project' }
  | { state: 'no-project' }

/** Errors from the flow secrets file (.raider/flows/env) channels; never carries a value */
export type FlowEnvError = {
  error:
    | 'invalid'
    | 'unsafe'
    | 'too-large'
    | 'value-unsupported'
    | 'no-project'
    | 'unsupported'
    | 'io'
}

/** The keys of the flow secrets file, in file order; values never leave the main process */
export type FlowEnvKeys = { keys: string[] }
