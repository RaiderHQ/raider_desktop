// `raider schedule` (ruby_raider 4.2+): what main reads from the gem's JSON output and run
// logs, and what the renderer sends to schedule the project's tests.

export type ScheduleEvery = 'hour' | 'day' | 'weekday' | 'week'
export type ScheduleDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** When a schedule runs and what it does on failure. */
export interface ScheduleSettings {
  every: ScheduleEvery
  /** HH:MM; for every hour only the minute counts (00:MM) */
  at: string
  on?: ScheduleDay
  retries: number
  notify: boolean
}

/** Which tests a schedule runs: all, one tag, or listed spec files (project-relative). */
export type ScheduleSelection =
  | { kind: 'all' }
  | { kind: 'tag'; tag: string }
  | { kind: 'files'; files: string[] }

/** What `add-schedule` takes: a whole schedule, added or replacing the one with its name. */
export interface ScheduleRequest extends ScheduleSettings {
  name: string
  showBrowser: boolean
  selection: ScheduleSelection
}

export interface ScheduledRunCounts {
  total: number
  passed: number
  failed: number
  skipped: number
}

/** A schedule's last run: the run log's last line (busy included), else the gem's `last`. */
export interface ScheduledLastRun {
  status: 'passed' | 'failed' | 'setup_error' | 'busy'
  finishedAt: string
  trigger: 'manual' | 'schedule'
  counts: ScheduledRunCounts
}

/** A schedule in .raider/schedules/schedules.yml, with what the OS says about it */
export interface GemScheduleRule {
  name: string
  orphan?: false
  every: ScheduleEvery
  at: string
  on: ScheduleDay | null
  retries: number
  notify: boolean
  showBrowser: boolean
  selection: ScheduleSelection
  nextRunAt: string | null
  osState: string
  last: ScheduledLastRun | null
}

/**
 * A job the OS still runs that schedules.yml no longer lists (deleted .raider, git clean, a
 * corrupt file): no rule to show, only the OS state and Remove.
 */
export interface GemOrphanSchedule {
  name: string
  orphan: true
  osState: string
  last: ScheduledLastRun | null
}

export type GemSchedule = GemScheduleRule | GemOrphanSchedule

/** `list-schedules`: the gem's one-line notice (4.1 schedules cleaned up) and the rows. */
export interface SchedulesList {
  notice: string | null
  schedules: GemSchedule[]
}

/** `schedules-status`: read from files only, never runs the gem. */
export interface SchedulesStatus {
  /** ruby_raider ≥ 4.2 in the project's Gemfile.lock (an unknown version is false) */
  supported: boolean
  /** The locked ruby_raider version, or null */
  version: string | null
  /** A 4.1 .raider/flows/schedules.yml is there (the gem removes those on its next call) */
  oldSchedules: boolean
  // process.platform in main ("darwin", "win32", "linux", …)
  platform: string
}

/** `add-schedule` / `remove-schedule`: the gem's stdout line and its 4.1-cleanup notice. */
export interface ScheduleChangeResult {
  ok: true
  message: string
  notice: string | null
}

/**
 * Why a schedules call failed. The renderer maps codes to copy: `needs42` →
 * schedules.errors.needs42, `rubyCantRun` → schedules.errors.rubyCantRun, `noReport` →
 * schedules.errors.noReport, `ruby` → schedules.noRuby; `refused` carries the gem's own
 * one-line message; anything else without a message → schedules.cliFailed.
 */
export type GemCliError = {
  error:
    | 'gem-output'
    | 'timeout'
    | 'ruby'
    | 'refused'
    | 'invalid'
    | 'no-project'
    | 'unsupported'
    | 'needs42'
    | 'rubyCantRun'
    | 'noReport'
    | 'open-failed'
  message?: string
}
