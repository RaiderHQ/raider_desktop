import type { TFunction } from 'i18next'
import { isScheduleTag } from '@shared/schedules'
import type {
  GemCliError,
  GemSchedule,
  GemScheduleRule,
  ScheduleRequest,
  ScheduledLastRun,
  ScheduleSelection
} from '@shared/types/schedules'

type T = TFunction | ((key: string, options?: Record<string, unknown>) => string)

// The copy is English, so the day and month names around it are too (as SavedLogins does)
const LOCALE = 'en'

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const clock = (d: Date): string =>
  new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(d)

/** "08:00 today", "08:00 yesterday", else "3 Nov, 08:00" in the user's locale. */
export function whenText(t: T, iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const time = clock(d)
  if (sameDay(d, now)) return t('schedules.when.today', { time })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return t('schedules.when.yesterday', { time })
  const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(d)
  return t('schedules.when.date', { date, time })
}

/**
 * "Passed 12 · 08:00 today", "Failed 2 of 12 · …", "Could not start · …", "Skipped, another
 * run was going · …", or "Not run yet".
 */
export function lastResultText(t: T, last: ScheduledLastRun | null, now: Date): string {
  if (!last) return t('schedules.last.never')
  const when = whenText(t, last.finishedAt, now)
  const { passed, failed, total } = last.counts
  switch (last.status) {
    case 'passed':
      return t('schedules.last.passed', { passed, when })
    case 'failed':
      return t('schedules.last.failed', { failed, total, when })
    case 'busy':
      return t('schedules.last.busy', { when })
    default:
      return t('schedules.last.setupError', { when })
  }
}

/** "Every weekday at 08:00", "Every hour at :15", "Every Monday at 08:00". */
export function scheduleText(t: T, s: Pick<GemScheduleRule, 'every' | 'at' | 'on'>): string {
  const minute = s.at.slice(3)
  return s.every === 'hour'
    ? t('schedules.every.hour', { minute })
    : s.every === 'week'
      ? t('schedules.every.week', { day: t(`schedules.days.${s.on ?? 'mon'}`), time: s.at })
      : t(`schedules.every.${s.every}`, { time: s.at })
}

/** "Tue 08:00" from the gem's local ISO time; null without a valid one. */
export function nextRunShort(nextRunAt: string | null): string | null {
  if (!nextRunAt) return null
  const d = new Date(nextRunAt)
  if (Number.isNaN(d.getTime())) return null
  const day = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(d)
  return `${day} ${clock(d)}`
}

/** "Next run Tue 08:00", from the gem's local ISO time; null without one. */
export function nextRunText(t: T, nextRunAt: string | null): string | null {
  const when = nextRunShort(nextRunAt)
  return when ? t('schedules.nextRun', { when }) : null
}

/** The schedules' soonest next run, as `nextRunAt` (null when none has one). */
export function soonestNextRun(schedules: GemSchedule[]): string | null {
  let soonest: { iso: string; time: number } | null = null
  for (const s of schedules) {
    if (s.orphan || !s.nextRunAt) continue
    const time = new Date(s.nextRunAt).getTime()
    if (Number.isNaN(time)) continue
    if (!soonest || time < soonest.time) soonest = { iso: s.nextRunAt, time }
  }
  return soonest?.iso ?? null
}

/** "All tests", "Tag smoke", "3 tests". */
export function runsText(t: T, selection: ScheduleSelection): string {
  if (selection.kind === 'tag') return t('schedules.row.runsTag', { tag: selection.tag })
  if (selection.kind === 'files')
    return t('schedules.row.runsFiles', { count: selection.files.length })
  return t('schedules.row.runsAll')
}

/** A schedules call's error in the user's words; the gem's own refusal line as given. */
export function scheduleErrorText(t: T, error: GemCliError): string {
  switch (error.error) {
    case 'needs42':
      return t('schedules.errors.needs42')
    case 'rubyCantRun':
      return t('schedules.errors.rubyCantRun')
    case 'noReport':
      return t('schedules.errors.noReport')
    case 'ruby':
      return t('schedules.noRuby')
    default:
      return error.message || t('schedules.cliFailed')
  }
}

const NAME_MAX = 60

/** A name from what runs: all_tests, tag_<tag>, selected_tests; _2, _3… when taken. */
export function suggestName(selection: ScheduleSelection, taken: string[]): string {
  const base =
    selection.kind === 'tag'
      ? `tag_${selection.tag.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`
      : selection.kind === 'files'
        ? 'selected_tests'
        : 'all_tests'
  const used = new Set(taken)
  const fit = (suffix: string): string => base.slice(0, NAME_MAX - suffix.length) + suffix
  if (!used.has(fit(''))) return fit('')
  for (let n = 2; ; n++) {
    const name = fit(`_${n}`)
    if (!used.has(name)) return name
  }
}

/** The gem's os_state for a schedule whose spec file is gone. */
export const FILE_NOT_FOUND = 'test file not found: '

/** The missing file an os_state names, or null when it is about something else. */
export const missingFileOf = (osState: string): string | null =>
  osState.startsWith(FILE_NOT_FOUND) ? osState.slice(FILE_NOT_FOUND.length) : null

/** Whether a selection can be sent: a valid tag, or at least one file. */
export const selectionReady = (selection: ScheduleSelection): boolean =>
  selection.kind === 'all' ||
  (selection.kind === 'tag' && isScheduleTag(selection.tag)) ||
  (selection.kind === 'files' && selection.files.length > 0)

/**
 * A listed schedule as an add request (Re-schedule). Built field by field: main refuses any
 * other key, and `on` only goes with a weekly rule. Linux never shows the browser.
 */
export function requestFromRule(rule: GemScheduleRule, platform: string): ScheduleRequest {
  return {
    name: rule.name,
    every: rule.every,
    at: rule.at,
    ...(rule.every === 'week' && rule.on ? { on: rule.on } : {}),
    retries: rule.retries,
    notify: rule.notify,
    showBrowser: platform === 'linux' ? false : rule.showBrowser,
    selection: rule.selection
  }
}
