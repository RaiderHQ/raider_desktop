import type { TFunction } from 'i18next'
import type { ScheduledLastRun, GemCliError, GemScheduleRule } from '@shared/types/schedules'

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

/** "Every weekday at 08:00", "Every hour at :15", "Every Monday at 08:00" (+ notify). */
export function scheduleText(
  t: T,
  s: Pick<GemScheduleRule, 'every' | 'at' | 'on' | 'notify'>
): string {
  const minute = s.at.slice(3)
  const text =
    s.every === 'hour'
      ? t('schedules.every.hour', { minute })
      : s.every === 'week'
        ? t('schedules.every.week', { day: t(`schedules.days.${s.on ?? 'mon'}`), time: s.at })
        : t(`schedules.every.${s.every}`, { time: s.at })
  return s.notify ? t('schedules.every.withNotify', { text }) : text
}

/** "Next run Tue 08:00", from the gem's local ISO time; null without one. */
export function nextRunText(t: T, nextRunAt: string | null): string | null {
  if (!nextRunAt) return null
  const d = new Date(nextRunAt)
  if (Number.isNaN(d.getTime())) return null
  const day = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(d)
  return t('schedules.nextRun', { when: `${day} ${clock(d)}` })
}

/** The gem's one-line message for a refused or failed command, else a plain fallback. */
export const cliErrorText = (t: T, error: GemCliError): string =>
  error.message || t('schedules.cliFailed')
