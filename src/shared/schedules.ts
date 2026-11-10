import type { FlowDay, FlowEvery, FlowSchedule } from './types/schedules'

// --- Scheduling (raider flow schedule, ruby_raider 4.1+) ---

/** The gem's rule for a flow input name (`--input NAME=VALUE`) */
export const FLOW_INPUT_NAME = /^[a-z][a-z0-9_]{0,39}$/
const MAX_INPUTS = 20
const MAX_INPUT_VALUE = 2000
// The gem refuses control characters in a scheduled input (they end up in the OS entry)
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/

const EVERY: readonly FlowEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly FlowDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const FLOW_AT = /^([01]\d|2[0-3]):[0-5]\d$/
const SCHEDULE_KEYS = ['every', 'at', 'on', 'retries', 'notify', 'inputs']
const MAX_RETRIES = 3

/** True for a plain `{}` object (not an array, null or a class instance). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * The inputs of a scheduled flow, checked the way the gem checks them: at most 20, each a
 * valid name with a string value of at most 2000 characters and no control character.
 * Throws otherwise; returns a fresh plain copy.
 */
export function validateFlowInputs(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) throw new Error('The inputs are not valid.')
  const entries = Object.entries(value)
  if (entries.length > MAX_INPUTS) throw new Error(`A flow takes at most ${MAX_INPUTS} inputs.`)
  const inputs: Record<string, string> = {}
  for (const [name, input] of entries) {
    if (!FLOW_INPUT_NAME.test(name)) throw new Error(`Not a valid input name: ${name}`)
    if (typeof input !== 'string') throw new Error(`The input ${name} is not text.`)
    if (input.length > MAX_INPUT_VALUE) throw new Error(`The input ${name} is too long.`)
    if (CONTROL_CHAR.test(input)) throw new Error(`The input ${name} holds a control character.`)
    inputs[name] = input
  }
  return inputs
}

/** A schedule exactly as the Flows tab may send it; throws on anything else. */
export function validateSchedule(value: unknown): FlowSchedule {
  if (!isPlainObject(value)) throw new Error('The schedule is not valid.')
  const unknown = Object.keys(value).find((key) => !SCHEDULE_KEYS.includes(key))
  if (unknown !== undefined) throw new Error(`Unknown schedule field: ${unknown}`)
  const { every, at, on, retries, notify, inputs } = value
  if (!EVERY.includes(every as FlowEvery)) throw new Error('Not a valid repeat.')
  if (typeof at !== 'string' || !FLOW_AT.test(at)) throw new Error('Not a valid time.')
  if (every === 'week') {
    if (!DAYS.includes(on as FlowDay)) throw new Error('A weekly schedule needs a day.')
  } else if (on !== undefined) {
    throw new Error('Only a weekly schedule takes a day.')
  }
  if (!Number.isInteger(retries) || (retries as number) < 0 || (retries as number) > MAX_RETRIES)
    throw new Error(`Retries must be 0 to ${MAX_RETRIES}.`)
  if (typeof notify !== 'boolean') throw new Error('Not a valid notify setting.')
  const schedule: FlowSchedule = {
    every: every as FlowEvery,
    at,
    retries: retries as number,
    notify,
    inputs: validateFlowInputs(inputs)
  }
  if (every === 'week') schedule.on = on as FlowDay
  return schedule
}

/**
 * The `raider flow schedule` arguments for a validated schedule; the inputs come last.
 * The gem's `--input` is a Thor array option: it takes every `NAME=VALUE` after one flag, and a
 * repeated `--input` replaces the earlier ones, so all pairs follow a single `--input`. Each pair
 * starts with its name (a lower-case letter), so a value starting with `-` never reads as a flag.
 */
export function scheduleArgs(name: string, s: FlowSchedule): string[] {
  const pairs = Object.entries(s.inputs).map(([k, v]) => `${k}=${v}`)
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
    ...(s.notify ? ['--notify'] : []),
    ...(pairs.length > 0 ? ['--input', ...pairs] : [])
  ]
}
