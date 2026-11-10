import type { TFunction } from 'i18next'
import type { GemFlow } from '@shared/types/flows'
import type {
  FlowCliError,
  FlowLastRun,
  GemSchedule,
  GemScheduleRule
} from '@shared/types/schedules'
import { validateFlowInputs } from '@shared/schedules'
import type { FlowInput, ProjectFlowEntry } from '@shared/types/projectTest'

type T = TFunction | ((key: string, options?: Record<string, unknown>) => string)

/** One line of the Flows tab: the project's flow with what the gem knows about it. */
export interface FlowRowData {
  /** The flow's name for `raider flow <name>` (the file's stem) */
  name: string
  /** What the row shows: the recording's name, else the stem */
  title: string
  inputs: FlowInput[]
  /** Set for a flow Raider recorded: Edit opens its test page */
  testId?: string
  /** The flow file is gone (a schedule or a record outlived it) */
  missing: boolean
  last: FlowLastRun | null
  schedule: GemSchedule | null
}

const later = (a: FlowLastRun | null, b: FlowLastRun | null): FlowLastRun | null => {
  if (!a) return b
  if (!b) return a
  return Date.parse(b.finishedAt) > Date.parse(a.finishedAt) ? b : a
}

/**
 * The rows: one per project flow (names, inputs and record from the project), with the last
 * result (`flow list`) and the schedule (`flow schedules`) joined by name. A schedule whose
 * flow is gone still gets a row, so it can be stopped.
 */
export function mergeFlows(
  entries: ProjectFlowEntry[],
  flows: GemFlow[],
  schedules: GemSchedule[]
): FlowRowData[] {
  const lastBy = new Map(flows.map((f) => [f.name, f.last]))
  const scheduleBy = new Map(schedules.map((s) => [s.name, s]))
  const rows: FlowRowData[] = entries.map((entry) => {
    const schedule = scheduleBy.get(entry.stem) ?? null
    return {
      name: entry.stem,
      title: entry.name || entry.stem,
      inputs: entry.inputs,
      ...(entry.testId ? { testId: entry.testId } : {}),
      missing: entry.missingFile === true,
      last: later(lastBy.get(entry.stem) ?? null, schedule?.last ?? null),
      schedule
    }
  })
  const known = new Set(rows.map((r) => r.name))
  for (const schedule of schedules) {
    if (known.has(schedule.name)) continue
    rows.push({
      name: schedule.name,
      title: schedule.name,
      inputs: [],
      missing: true,
      last: later(lastBy.get(schedule.name) ?? null, schedule.last),
      schedule
    })
  }
  return rows
}

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
  if (sameDay(d, now)) return t('flows.when.today', { time })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return t('flows.when.yesterday', { time })
  const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(d)
  return t('flows.when.date', { date, time })
}

/** "Completed 08:00 today", "Failed at step 4, 08:00 today", or "Not run yet". */
export function lastResultText(t: T, last: FlowLastRun | null, now: Date): string {
  if (!last) return t('flows.last.never')
  const when = whenText(t, last.finishedAt, now)
  switch (last.status) {
    case 'completed':
      return t('flows.last.completed', { when })
    case 'setup_error':
      return t('flows.last.setupError', { when })
    case 'busy':
      return t('flows.last.busy', { when })
    default: {
      const step = last.failedStep
      if (step?.number !== undefined) return t('flows.last.failedStep', { step: step.number, when })
      if (step) return t('flows.last.failedLine', { line: step.line, when })
      return t('flows.last.failed', { when })
    }
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
      ? t('flows.every.hour', { minute })
      : s.every === 'week'
        ? t('flows.every.week', { day: t(`flows.days.${s.on ?? 'mon'}`), time: s.at })
        : t(`flows.every.${s.every}`, { time: s.at })
  return s.notify ? t('flows.every.withNotify', { text }) : text
}

/** "Next run Tue 08:00", from the gem's local ISO time; null without one. */
export function nextRunText(t: T, nextRunAt: string | null): string | null {
  if (!nextRunAt) return null
  const d = new Date(nextRunAt)
  if (Number.isNaN(d.getTime())) return null
  const day = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(d)
  return t('flows.nextRun', { when: `${day} ${clock(d)}` })
}

/** The OS lost the flow's file: the only fix is to stop the schedule */
export const flowGoneFromOs = (osState: string): boolean => /flow not found/i.test(osState)

/** Why each input can't be sent, by input name (the gem's rules, from validateFlowInputs). */
export function inputErrors(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    try {
      validateFlowInputs({ [name]: value })
    } catch (error) {
      errors[name] = error instanceof Error ? error.message : String(error)
    }
  }
  return errors
}

/** The gem's one-line message for a refused or failed command, else a plain fallback. */
export const cliErrorText = (t: T, error: FlowCliError): string =>
  error.message || t('flows.cliFailed')
