import type { ScheduleDay, ScheduleEvery, ScheduleSettings } from './types/schedules'

// --- Scheduling (raider flow schedule, ruby_raider 4.1+) ---

const EVERY: readonly ScheduleEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly ScheduleDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const SCHEDULE_AT = /^([01]\d|2[0-3]):[0-5]\d$/
const SCHEDULE_KEYS = ['every', 'at', 'on', 'retries', 'notify']
const MAX_RETRIES = 3

/**
 * The gem's rule for the name of a scheduled job: lower-case letters, digits and _, at most
 * 60, and never a name the gem keeps for itself.
 */
export const SCHEDULE_NAME = /^[a-z0-9_]{1,60}$/
/** Names the gem keeps for itself */
export const RESERVED_SCHEDULE_NAMES: readonly string[] = ['env']

export const isScheduleName = (name: string): boolean =>
  SCHEDULE_NAME.test(name) && !RESERVED_SCHEDULE_NAMES.includes(name)

/** True for a plain `{}` object (not an array, null or a class instance). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** A schedule exactly as the app may send it; throws on anything else. */
export function validateSchedule(value: unknown): ScheduleSettings {
  if (!isPlainObject(value)) throw new Error('The schedule is not valid.')
  const unknown = Object.keys(value).find((key) => !SCHEDULE_KEYS.includes(key))
  if (unknown !== undefined) throw new Error(`Unknown schedule field: ${unknown}`)
  const { every, at, on, retries, notify } = value
  if (!EVERY.includes(every as ScheduleEvery)) throw new Error('Not a valid repeat.')
  if (typeof at !== 'string' || !SCHEDULE_AT.test(at)) throw new Error('Not a valid time.')
  if (every === 'week') {
    if (!DAYS.includes(on as ScheduleDay)) throw new Error('A weekly schedule needs a day.')
  } else if (on !== undefined) {
    throw new Error('Only a weekly schedule takes a day.')
  }
  if (!Number.isInteger(retries) || (retries as number) < 0 || (retries as number) > MAX_RETRIES)
    throw new Error(`Retries must be 0 to ${MAX_RETRIES}.`)
  if (typeof notify !== 'boolean') throw new Error('Not a valid notify setting.')
  const schedule: ScheduleSettings = {
    every: every as ScheduleEvery,
    at,
    retries: retries as number,
    notify
  }
  if (every === 'week') schedule.on = on as ScheduleDay
  return schedule
}

/** The `raider flow schedule` arguments for a validated schedule. */
export function scheduleArgs(name: string, s: ScheduleSettings): string[] {
  return [
    'schedule',
    name,
    '--every',
    s.every,
    '--at',
    s.every === 'hour' ? `:${s.at.slice(3)}` : s.at,
    ...(s.every === 'week' && s.on ? ['--on', s.on] : []),
    '--retries',
    String(s.retries),
    ...(s.notify ? ['--notify'] : [])
  ]
}
