// `raider flow schedule` (ruby_raider 4.1+): what main reads from the gem's JSON output and
// what the renderer sends back to schedule a run.

export type FlowEvery = 'hour' | 'day' | 'weekday' | 'week'
export type FlowDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface FlowSchedule {
  every: FlowEvery
  at: string
  on?: FlowDay
  retries: number
  notify: boolean
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

/** A schedule in .raider/flows/schedules.yml, with what the OS says about it */
export interface GemScheduleRule {
  name: string
  orphan?: false
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

/**
 * A flow the OS still runs on a schedule that schedules.yml no longer lists (deleted .raider,
 * git clean, a corrupt file): no rule to show, only the OS state and Stop schedule.
 */
export interface GemOrphanSchedule {
  name: string
  orphan: true
  osState: string
  last: FlowLastRun | null
}

export type GemSchedule = GemScheduleRule | GemOrphanSchedule

export type GemCliError = {
  error: 'gem-output' | 'timeout' | 'ruby' | 'refused' | 'invalid' | 'no-project' | 'unsupported'
  message?: string
}
