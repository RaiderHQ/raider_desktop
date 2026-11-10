import { SCHEDULE_AT, isScheduleName } from '../../../shared/schedules'
import type {
  ScheduleDay,
  ScheduleEvery,
  ScheduledFailedStep,
  ScheduledLastRun,
  GemSchedule
} from '../../../shared/types/schedules'

// `raider flow schedules --json` prints what the project says: untrusted. Every field is
// checked; an entry that doesn't fit is dropped, a last run that doesn't fit becomes null.

const MAX_STRING = 1000
const MAX_ENTRIES = 1000
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

const STATUSES: readonly ScheduledLastRun['status'][] = [
  'completed',
  'failed',
  'setup_error',
  'busy'
]
const TRIGGERS: readonly NonNullable<ScheduledLastRun['trigger']>[] = [
  'manual',
  'schedule',
  'desktop'
]
const EVERY: readonly ScheduleEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly ScheduleDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STRING
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const isLine = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1

/** Free text from the gem, made safe to show: no control characters, at most 1000 chars. */
export const plainText = (value: string): string =>
  value.replace(CONTROL_CHARS, '').slice(0, MAX_STRING)

function parseFailedStep(value: unknown): ScheduledFailedStep | null | undefined {
  if (value === null) return null
  if (!isObject(value) || !isString(value.title) || !isLine(value.line)) return undefined
  const step: ScheduledFailedStep = { title: value.title, line: value.line }
  if (value.number !== undefined) {
    if (!isLine(value.number)) return undefined
    step.number = value.number
  }
  return step
}

function parseLastRun(value: unknown, name: string): ScheduledLastRun | null {
  if (!isObject(value)) return null
  const { status, finished_at, trigger, failed_step, results_dir } = value
  if (!STATUSES.includes(status as ScheduledLastRun['status'])) return null
  if (!isString(finished_at) || !isString(results_dir)) return null
  // Only this flow's own results folder: the renderer may open it
  if (!new RegExp(`^flow-results/${name}/\\d{8}T\\d{6}Z(-\\d+)?$`).test(results_dir)) return null
  if (trigger !== undefined && !TRIGGERS.includes(trigger as never)) return null
  const failedStep = parseFailedStep(failed_step ?? null)
  if (failedStep === undefined) return null
  const last: ScheduledLastRun = {
    status: status as ScheduledLastRun['status'],
    finishedAt: finished_at,
    failedStep,
    resultsDir: results_dir
  }
  if (trigger !== undefined) last.trigger = trigger as ScheduledLastRun['trigger']
  return last
}

const isName = (v: unknown): v is string => typeof v === 'string' && isScheduleName(v)

// The rule fields of a schedules row: all null for a job the OS runs but schedules.yml lost.
// An `inputs` field from an older gem is ignored: the desktop never reads or sends inputs.
const RULE_FIELDS = ['every', 'at', 'on', 'retries', 'notify', 'next_run_at'] as const

const osStateText = (osState: string): string => plainText(osState.slice(0, MAX_STRING * 4))

function parseSchedule(value: unknown): GemSchedule | null {
  if (!isObject(value) || !isName(value.name)) return null
  const { name, every, at, on, retries, notify, next_run_at, os_state } = value
  if (RULE_FIELDS.every((field) => value[field] === null)) {
    if (typeof os_state !== 'string') return null
    return {
      name,
      orphan: true,
      osState: osStateText(os_state),
      last: parseLastRun(value.last, name)
    }
  }
  if (!EVERY.includes(every as ScheduleEvery)) return null
  if (typeof at !== 'string' || !SCHEDULE_AT.test(at)) return null
  if (on !== null && !DAYS.includes(on as ScheduleDay)) return null
  if (!isCount(retries) || typeof notify !== 'boolean') return null
  if (next_run_at !== null && !isString(next_run_at)) return null
  if (typeof os_state !== 'string') return null
  return {
    name,
    every: every as ScheduleEvery,
    at,
    on: on as ScheduleDay | null,
    retries,
    notify,
    nextRunAt: next_run_at,
    osState: osStateText(os_state),
    last: parseLastRun(value.last, name)
  }
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  return value
    .slice(0, MAX_ENTRIES)
    .map(parse)
    .filter((entry): entry is T => entry !== null)
}

/** `flow schedules --json` as GemSchedule[]; null when the output is not a list. */
export const parseGemSchedules = (value: unknown): GemSchedule[] | null =>
  parseList(value, parseSchedule)
