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
