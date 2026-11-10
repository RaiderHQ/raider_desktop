import { FLOW_AT, FLOW_INPUT_NAME, flowFile, isFlowName } from '../../../shared/flows'
import type {
  FlowDay,
  FlowEvery,
  FlowFailedStep,
  FlowLastRun,
  GemFlow,
  GemSchedule
} from '../../../shared/types/flows'

// `raider flow list|schedules --json` prints what the project says: untrusted. Every field is
// checked; an entry that doesn't fit is dropped, a last run that doesn't fit becomes null.

const MAX_STRING = 1000
const MAX_ENTRIES = 1000
const MAX_INPUT_VALUE = 2000
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

const STATUSES: readonly FlowLastRun['status'][] = ['completed', 'failed', 'setup_error', 'busy']
const TRIGGERS: readonly NonNullable<FlowLastRun['trigger']>[] = ['manual', 'schedule', 'desktop']
const EVERY: readonly FlowEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: readonly FlowDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STRING
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const isLine = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1

/** Free text from the gem, made safe to show: no control characters, at most 1000 chars. */
export const plainText = (value: string): string =>
  value.replace(CONTROL_CHARS, '').slice(0, MAX_STRING)

function parseFailedStep(value: unknown): FlowFailedStep | null | undefined {
  if (value === null) return null
  if (!isObject(value) || !isString(value.title) || !isLine(value.line)) return undefined
  const step: FlowFailedStep = { title: value.title, line: value.line }
  if (value.number !== undefined) {
    if (!isLine(value.number)) return undefined
    step.number = value.number
  }
  return step
}

function parseLastRun(value: unknown, name: string): FlowLastRun | null {
  if (!isObject(value)) return null
  const { status, finished_at, trigger, failed_step, results_dir } = value
  if (!STATUSES.includes(status as FlowLastRun['status'])) return null
  if (!isString(finished_at) || !isString(results_dir)) return null
  // Only this flow's own results folder: the renderer may open it
  if (!new RegExp(`^flow-results/${name}/\\d{8}T\\d{6}Z(-\\d+)?$`).test(results_dir)) return null
  if (trigger !== undefined && !TRIGGERS.includes(trigger as never)) return null
  const failedStep = parseFailedStep(failed_step ?? null)
  if (failedStep === undefined) return null
  const last: FlowLastRun = {
    status: status as FlowLastRun['status'],
    finishedAt: finished_at,
    failedStep,
    resultsDir: results_dir
  }
  if (trigger !== undefined) last.trigger = trigger as FlowLastRun['trigger']
  return last
}

const isName = (v: unknown): v is string => typeof v === 'string' && isFlowName(v)

function parseFlow(value: unknown): GemFlow | null {
  if (!isObject(value) || !isName(value.name)) return null
  if (value.file !== flowFile(value.name)) return null
  return { name: value.name, file: value.file, last: parseLastRun(value.last, value.name) }
}

/** The gem's `"k=v"` input strings as a record; null when one doesn't fit. */
function parseInputs(value: unknown): Record<string, string> | null {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null
  const inputs: Record<string, string> = {}
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    const at = entry.indexOf('=')
    if (at < 0) return null
    const key = entry.slice(0, at)
    const input = entry.slice(at + 1)
    if (!FLOW_INPUT_NAME.test(key) || input.length > MAX_INPUT_VALUE) return null
    inputs[key] = input
  }
  return inputs
}

function parseSchedule(value: unknown): GemSchedule | null {
  if (!isObject(value) || !isName(value.name)) return null
  const { name, every, at, on, retries, notify, next_run_at, os_state } = value
  if (!EVERY.includes(every as FlowEvery)) return null
  if (typeof at !== 'string' || !FLOW_AT.test(at)) return null
  if (on !== null && !DAYS.includes(on as FlowDay)) return null
  if (!isCount(retries) || typeof notify !== 'boolean') return null
  if (next_run_at !== null && !isString(next_run_at)) return null
  if (typeof os_state !== 'string') return null
  const inputs = parseInputs(value.inputs)
  if (inputs === null) return null
  return {
    name,
    every: every as FlowEvery,
    at,
    on: on as FlowDay | null,
    retries,
    inputs,
    notify,
    nextRunAt: next_run_at,
    osState: plainText(os_state.slice(0, MAX_STRING * 4)),
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

/** `flow list --json` as GemFlow[]; null when the output is not a list. */
export const parseGemFlows = (value: unknown): GemFlow[] | null => parseList(value, parseFlow)

/** `flow schedules --json` as GemSchedule[]; null when the output is not a list. */
export const parseGemSchedules = (value: unknown): GemSchedule[] | null =>
  parseList(value, parseSchedule)
