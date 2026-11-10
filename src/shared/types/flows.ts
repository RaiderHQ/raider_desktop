// The Flows tab's view of `raider flow` (ruby_raider 4.1+): what main reads from the gem's
// JSON output and what the renderer sends back to schedule a flow.

export type FlowEvery = 'hour' | 'day' | 'weekday' | 'week'
export type FlowDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface FlowSchedule {
  every: FlowEvery
  at: string
  on?: FlowDay
  retries: number
  notify: boolean
  inputs: Record<string, string>
}

export interface FlowFailedStep {
  number?: number
  title: string
  line: number
}

export interface FlowLastRun {
  status: 'completed' | 'failed' | 'setup_error' | 'busy'
  finishedAt: string
  trigger?: 'manual' | 'schedule' | 'desktop'
  failedStep: FlowFailedStep | null
  resultsDir: string
}

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

export interface GemSchedule {
  name: string
  every: FlowEvery
  at: string
  on: FlowDay | null
  retries: number
  inputs: Record<string, string>
  notify: boolean
  nextRunAt: string | null
  osState: string
  last: FlowLastRun | null
}

export type FlowsStatus =
  | { state: 'ready' }
  | { state: 'needs-setup' }
  | { state: 'unsupported'; reason: 'gem' | 'project' }
  | { state: 'no-project' }

export type FlowCliError = {
  error: 'gem-output' | 'timeout' | 'ruby' | 'refused' | 'invalid' | 'no-project' | 'unsupported'
  message?: string
}
