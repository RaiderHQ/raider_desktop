import {
  MAX_SCHEDULE_FILES,
  SCHEDULE_AT,
  isPlainObject,
  isScheduleName,
  isScheduleSpecFile,
  isScheduleTag
} from '../../../shared/schedules'
import type {
  GemSchedule,
  ScheduleDay,
  ScheduleEvery,
  ScheduleSelection,
  ScheduledLastRun,
  ScheduledRunCounts,
  SchedulesList
} from '../../../shared/types/schedules'

// `raider schedule list --json` (and each schedule's runs.jsonl) say what the project says:
// untrusted. Every field is checked; a row that doesn't fit is dropped, a last run that
// doesn't fit becomes null, and a root that doesn't fit makes the whole answer gem-output.

const MAX_STRING = 1000
const MAX_ENTRIES = 1000
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

const STATUSES: readonly ScheduledLastRun['status'][] = ['passed', 'failed', 'setup_error', 'busy']
const TRIGGERS: readonly ScheduledLastRun['trigger'][] = ['manual', 'schedule']
const EVERY: readonly ScheduleEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly ScheduleDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const COUNT_KEYS = ['total', 'passed', 'failed', 'skipped'] as const

type Json = Record<string, unknown>

const isString = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STRING
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const isName = (v: unknown): v is string => typeof v === 'string' && isScheduleName(v)

/** Free text from the gem, made safe to show: no control characters, at most 1000 chars. */
export const plainText = (value: string): string =>
  value
    .slice(0, MAX_STRING * 4)
    .replace(CONTROL_CHARS, '')
    .slice(0, MAX_STRING)

function parseCounts(value: unknown): ScheduledRunCounts | null {
  if (!isPlainObject(value)) return null
  if (!COUNT_KEYS.every((key) => isCount(value[key]))) return null
  const { total, passed, failed, skipped } = value as Record<string, number>
  return { total, passed, failed, skipped }
}

/**
 * A last run, from the list's `last` or a runs.jsonl line (which has more keys: those are
 * ignored). Null when it doesn't fit.
 */
export function parseLastRun(value: unknown): ScheduledLastRun | null {
  if (!isPlainObject(value)) return null
  const { status, finished_at, trigger } = value
  if (!STATUSES.includes(status as ScheduledLastRun['status'])) return null
  if (!isString(finished_at) || !TRIGGERS.includes(trigger as ScheduledLastRun['trigger']))
    return null
  const counts = parseCounts(value.counts)
  if (!counts) return null
  return {
    status: status as ScheduledLastRun['status'],
    finishedAt: plainText(finished_at),
    trigger: trigger as ScheduledLastRun['trigger'],
    counts
  }
}

function parseSelection(value: unknown): ScheduleSelection | null {
  if (!isPlainObject(value)) return null
  const keys = Object.keys(value)
  switch (value.kind) {
    case 'all':
      return keys.length === 1 ? { kind: 'all' } : null
    case 'tag':
      return keys.length === 2 && isScheduleTag(value.tag) ? { kind: 'tag', tag: value.tag } : null
    case 'files': {
      const { files } = value
      if (keys.length !== 2 || !Array.isArray(files)) return null
      if (files.length === 0 || files.length > MAX_SCHEDULE_FILES) return null
      return files.every(isScheduleSpecFile) ? { kind: 'files', files: [...files] } : null
    }
    default:
      return null
  }
}

// The rule fields of a list row: all null for a job the OS runs but schedules.yml lost
const RULE_FIELDS = [
  'every',
  'at',
  'on',
  'retries',
  'notify',
  'show_browser',
  'selection',
  'next_run_at'
] as const

function parseSchedule(value: unknown): GemSchedule | null {
  if (!isPlainObject(value) || !isName(value.name)) return null
  const { name, every, at, on, retries, notify, show_browser, next_run_at, os_state } = value
  if (typeof os_state !== 'string') return null
  const osState = plainText(os_state)
  if (RULE_FIELDS.every((field) => value[field] === null))
    return { name, orphan: true, osState, last: parseLastRun(value.last) }
  if (!EVERY.includes(every as ScheduleEvery)) return null
  if (typeof at !== 'string' || !SCHEDULE_AT.test(at)) return null
  if (every === 'week' ? !DAYS.includes(on as ScheduleDay) : on !== null) return null
  if (!isCount(retries) || retries > 3) return null
  if (typeof notify !== 'boolean' || typeof show_browser !== 'boolean') return null
  if (next_run_at !== null && !isString(next_run_at)) return null
  const selection = parseSelection(value.selection)
  if (!selection) return null
  return {
    name,
    every: every as ScheduleEvery,
    at,
    on: on as ScheduleDay | null,
    retries,
    notify,
    showBrowser: show_browser,
    selection,
    nextRunAt: next_run_at === null ? null : plainText(next_run_at),
    osState,
    last: parseLastRun(value.last)
  }
}

/** `schedule list --json` (`{notice, schedules}`); null when the root doesn't fit. */
export function parseScheduleList(value: unknown): SchedulesList | null {
  if (!isPlainObject(value)) return null
  const { notice, schedules } = value as Json
  if (notice !== null && typeof notice !== 'string') return null
  if (!Array.isArray(schedules)) return null
  return {
    notice: notice === null ? null : plainText(notice),
    schedules: schedules
      .slice(0, MAX_ENTRIES)
      .map(parseSchedule)
      .filter((entry): entry is GemSchedule => entry !== null)
  }
}
