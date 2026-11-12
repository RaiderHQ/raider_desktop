import type {
  ScheduleDay,
  ScheduleEvery,
  ScheduleRequest,
  ScheduleSelection,
  ScheduleSettings
} from './types/schedules'

// --- Scheduling (raider schedule, ruby_raider 4.2+) ---
// The gem checks all of this again; the app checks first so that nothing it did not mean to
// send (an option-shaped tag or file, a path out of the project) ever reaches its argv.

const EVERY: readonly ScheduleEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly ScheduleDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const SCHEDULE_AT = /^([01]\d|2[0-3]):[0-5]\d$/
const SCHEDULE_KEYS = ['every', 'at', 'on', 'retries', 'notify']
const REQUEST_KEYS = [...SCHEDULE_KEYS, 'name', 'showBrowser', 'selection']
const MAX_RETRIES = 3
/** The gem's cap on the spec files of one schedule */
export const MAX_SCHEDULE_FILES = 200
const MAX_TAG = 200
const MAX_FILE = 1000

/** The gem's rule for a schedule name: lower-case letters, digits and _, at most 60. */
export const SCHEDULE_NAME = /^[a-z0-9_]{1,60}$/

export const isScheduleName = (name: string): boolean => SCHEDULE_NAME.test(name)

// The gem's tag rule; it also admits `--project` or `-x`, which the app never sends
const TAG = /^[A-Za-z0-9_:-]+$/

export const isScheduleTag = (tag: unknown): tag is string =>
  typeof tag === 'string' && tag.length <= MAX_TAG && TAG.test(tag) && !tag.startsWith('-')

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * A spec file as a schedule may name it: relative with `/`, ending in _spec.rb, no `..`
 * part, no leading `-` or `/`, no backslash and no control characters (the gem's rule, and
 * stricter on the separator: listed project files always use `/`).
 */
export const isScheduleSpecFile = (file: unknown): file is string =>
  typeof file === 'string' &&
  file.length <= MAX_FILE &&
  file.endsWith('_spec.rb') &&
  !file.startsWith('-') &&
  !file.startsWith('/') &&
  !file.includes('\\') &&
  !CONTROL_CHARS.test(file) &&
  !/^[A-Za-z]:/.test(file) &&
  !file.split('/').includes('..')

/** True for a plain `{}` object (not an array, null or a class instance). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const onlyKeys = (value: Record<string, unknown>, keys: readonly string[], what: string): void => {
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown !== undefined) throw new Error(`Unknown ${what} field: ${unknown}`)
}

/** The rule part of a schedule exactly as the app may send it; throws on anything else. */
export function validateSchedule(value: unknown): ScheduleSettings {
  if (!isPlainObject(value)) throw new Error('The schedule is not valid.')
  onlyKeys(value, SCHEDULE_KEYS, 'schedule')
  return checkedSettings(value)
}

function checkedSettings(value: Record<string, unknown>): ScheduleSettings {
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

/** Which tests to run, exactly as the app may send it; throws on anything else. */
export function validateSelection(value: unknown): ScheduleSelection {
  if (!isPlainObject(value)) throw new Error('Not a valid choice of tests.')
  switch (value.kind) {
    case 'all':
      onlyKeys(value, ['kind'], 'selection')
      return { kind: 'all' }
    case 'tag':
      onlyKeys(value, ['kind', 'tag'], 'selection')
      if (!isScheduleTag(value.tag)) throw new Error('Not a valid tag.')
      return { kind: 'tag', tag: value.tag }
    case 'files': {
      onlyKeys(value, ['kind', 'files'], 'selection')
      const { files } = value
      if (!Array.isArray(files) || files.length === 0) throw new Error('No test files chosen.')
      // Counted before anything else is looked at, so a huge list costs nothing
      if (files.length > MAX_SCHEDULE_FILES)
        throw new Error(`Choose at most ${MAX_SCHEDULE_FILES} test files, or use a tag.`)
      for (const file of files) if (!isScheduleSpecFile(file)) throw new Error('Not a spec file.')
      return { kind: 'files', files: [...new Set(files as string[])] }
    }
    default:
      throw new Error('Not a valid choice of tests.')
  }
}

/** A whole `add-schedule` request; throws on anything the app would not send. */
export function validateScheduleRequest(value: unknown): ScheduleRequest {
  if (!isPlainObject(value)) throw new Error('The schedule is not valid.')
  onlyKeys(value, REQUEST_KEYS, 'schedule')
  const { name, showBrowser, selection } = value
  if (typeof name !== 'string' || !isScheduleName(name))
    throw new Error('Not a valid schedule name.')
  if (typeof showBrowser !== 'boolean') throw new Error('Not a valid show browser setting.')
  return {
    name,
    ...checkedSettings(value),
    showBrowser,
    selection: validateSelection(selection)
  }
}

/**
 * The `raider schedule add` arguments for a validated request: spec files positional right
 * after NAME (never an option), then the options. gemCli appends `--project` last.
 */
export function scheduleArgs(req: ScheduleRequest): string[] {
  const { selection } = req
  return [
    'schedule',
    'add',
    req.name,
    ...(selection.kind === 'files' ? selection.files : []),
    '--every',
    req.every,
    '--at',
    req.every === 'hour' ? `:${req.at.slice(3)}` : req.at,
    ...(req.every === 'week' && req.on ? ['--on', req.on] : []),
    ...(selection.kind === 'tag' ? ['--tag', selection.tag] : []),
    ...(req.showBrowser ? ['--show-browser'] : []),
    '--retries',
    String(req.retries),
    req.notify ? '--notify' : '--no-notify'
  ]
}
