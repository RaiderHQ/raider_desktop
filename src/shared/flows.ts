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
