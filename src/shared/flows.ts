import type { FlowDay, FlowEvery, FlowSchedule } from './types/flows'
/**
 * The gem's rule for a flow name (`flows/<name>_flow.rb`): lower-case letters, digits
 * and _, at most 60, and never one of the reserved names.
 */
export const FLOW_NAME = /^[a-z0-9_]{1,60}$/
/** Names `raider flow` keeps for itself */
export const RESERVED_FLOW_NAMES: readonly string[] = ['env']
/** Flows live directly in this folder at the project root (no subfolders) */
export const FLOWS_DIR = 'flows'
/** The stem of a flow whose name gives no usable slug */
export const FLOW_FALLBACK = 'recorded_flow'

const MAX_NAME = 60

export const isFlowName = (name: string): boolean =>
  FLOW_NAME.test(name) && !RESERVED_FLOW_NAMES.includes(name)

/**
 * The flow name for the n-th file of a slug: `<slug>` for the first, `<slug>_<n>` after,
 * with the slug cut so the whole stays within 60. Always passes isFlowName.
 */
export function flowStem(slug: string, n: number): string {
  const suffix = n > 1 ? `_${n}` : ''
  const usable = /^[a-z0-9_]*$/.test(slug) ? slug.replace(/^_+|_+$/g, '') : ''
  const base = (usable || FLOW_FALLBACK).slice(0, MAX_NAME - suffix.length).replace(/_+$/, '')
  const stem = (base || FLOW_FALLBACK) + suffix
  return RESERVED_FLOW_NAMES.includes(stem) ? `${stem}_flow` : stem
}

/** Project-relative POSIX path of the flow file with this name. */
export const flowFile = (stem: string): string => `${FLOWS_DIR}/${stem}_flow.rb`

const FLOW_FILE = /^flows\/([a-z0-9_]{1,60})_flow\.rb$/

/** The flow name of `rel` when it is exactly `flows/<name>_flow.rb` with a valid name, else null. */
export function flowStemOf(rel: unknown): string | null {
  if (typeof rel !== 'string') return null
  const stem = FLOW_FILE.exec(rel)?.[1]
  return stem !== undefined && isFlowName(stem) ? stem : null
}

/** True for a flow file's project-relative path: `flows/<name>_flow.rb`, no subfolders. */
export const isFlowFileRel = (rel: unknown): rel is string => flowStemOf(rel) !== null

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

/** The `raider flow schedule` arguments for a validated schedule; the `--input`s come last. */
export function scheduleArgs(name: string, s: FlowSchedule): string[] {
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
    ...Object.entries(s.inputs).flatMap(([k, v]) => ['--input', `${k}=${v}`])
  ]
}

// --- A flow run's results (ruby_raider 4.1+) ---

/** Where the gem writes each flow run's results: `flow-results/<name>/<UTC stamp>[-n]` */
export const FLOW_RESULTS_ROOT = 'flow-results'
/** The folder name of one flow run's results: a UTC stamp, `-n` when two runs share a second */
export const FLOW_RESULTS_STAMP = /^\d{8}T\d{6}Z(-\d+)?$/
const FLOW_RESULTS_DIR = /^flow-results\/([a-z0-9_]{1,60})\/(\d{8}T\d{6}Z(?:-\d+)?)$/

/**
 * The flow name of a project-relative results folder `flow-results/<name>/<stamp>`, or null.
 * When `name` is given, the folder must belong to that flow.
 */
export function flowOfResultsDir(rel: unknown, name?: string): string | null {
  if (typeof rel !== 'string') return null
  const flow = FLOW_RESULTS_DIR.exec(rel)?.[1]
  if (flow === undefined || !isFlowName(flow)) return null
  return name === undefined || flow === name ? flow : null
}

// --- Flow secrets (.raider/flows/env) ---

/** A key the Flows tab may write to the flow secrets file */
export const FLOW_SECRET_KEY = /^(RAIDER_SECRET_[A-Z0-9_]+|TEST_USER|TEST_PASSWORD)$/
/** The longest secret key */
export const MAX_FLOW_SECRET_KEY = 100

export const isFlowSecretKey = (key: unknown): key is string =>
  typeof key === 'string' && key.length <= MAX_FLOW_SECRET_KEY && FLOW_SECRET_KEY.test(key)
