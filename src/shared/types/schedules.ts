// `raider flow schedule` (ruby_raider 4.1+): what main reads from the gem's JSON output and
// what the renderer sends back to schedule a run.

export type ScheduleEvery = 'hour' | 'day' | 'weekday' | 'week'
export type ScheduleDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface ScheduleSettings {
  every: ScheduleEvery
  at: string
  on?: ScheduleDay
  retries: number
  notify: boolean
}

export interface ScheduledFailedStep {
  number?: number
  title: string
  line: number
}

export interface ScheduledLastRun {
  status: 'completed' | 'failed' | 'setup_error' | 'busy'
  finishedAt: string
  trigger?: 'manual' | 'schedule' | 'desktop'
  failedStep: ScheduledFailedStep | null
  resultsDir: string
}

/** A schedule in .raider/flows/schedules.yml, with what the OS says about it */
export interface GemScheduleRule {
  name: string
  orphan?: false
  every: ScheduleEvery
  at: string
  on: ScheduleDay | null
  retries: number
  notify: boolean
  nextRunAt: string | null
  osState: string
  last: ScheduledLastRun | null
}

/**
 * A flow the OS still runs on a schedule that schedules.yml no longer lists (deleted .raider,
 * git clean, a corrupt file): no rule to show, only the OS state and Stop schedule.
 */
export interface GemOrphanSchedule {
  name: string
  orphan: true
  osState: string
  last: ScheduledLastRun | null
}

export type GemSchedule = GemScheduleRule | GemOrphanSchedule

export type GemCliError = {
  error: 'gem-output' | 'timeout' | 'ruby' | 'refused' | 'invalid' | 'no-project' | 'unsupported'
  message?: string
}
