// Reads raider_reporter's local output (raider-results/) into the shape the
// project dashboard already renders. Local only: no network access.

import { TRACE_CONTENT_TYPE } from '@shared/types/raiderTrace'
import type { ComparisonStatus, ScreenshotComparison, TestResult } from './Types/testResult'
import type { TraceRef } from './Types/testResult'

interface DirNode {
  name: string
  type: string
  path?: string
}

export interface RaiderResultsApi {
  readDirectory: (folderPath: string) => Promise<DirNode[]>
  readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
}

export interface RaiderAttachment {
  name?: string
  content_type?: string
  path?: string
  attempt?: number
}

interface RaiderResult {
  identifier?: string
  file_path?: string
  line_number?: number
  full_name?: string
  status?: string
  duration_ms?: number
  failure?: {
    message?: string
    exception_class?: string
    backtrace?: string[]
    app_frame?: string
  }
  attachments?: RaiderAttachment[]
  comparisons?: unknown
}

const MAX_MESSAGE = 20000

export const sanitizeMessage = (message: string): string => {
  // eslint-disable-next-line no-control-regex
  let msg = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g, '')
  const encodingErrIdx = msg.indexOf('Unable to encode string')
  if (encodingErrIdx !== -1) {
    msg = msg.substring(0, encodingErrIdx).trim() || msg.substring(0, 500)
  }
  if (msg.length > MAX_MESSAGE) {
    msg = msg.substring(0, MAX_MESSAGE) + '\n… (message truncated)'
  }
  return msg
}

const KEPT_STATUSES = new Set(['passed', 'failed', 'quarantined'])

// quarantined (schema 2) keeps its own status; pending, skipped, unknown or missing show as skipped.
export const mapStatus = (status: string | undefined): string =>
  status !== undefined && KEPT_STATUSES.has(status) ? status : 'skipped'

// run.json is untrusted: only accept attachments[-<n>]/<file>. raider_reporter
// writes every attachment flat there (Payload#attachments_dir), and the
// raider-media protocol serves videos only from that same flat shape.
const safeAttachmentPath = (raw: string): string | null => {
  const p = raw.replace(/\\/g, '/')
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null
  const segments = p.split('/')
  if (segments.some((seg) => seg === '' || seg === '..' || seg === '.')) return null
  if (!/^attachments(-\d+)?$/.test(segments[0]) || segments.length !== 2) return null
  return p
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const MAX_COMPARISONS = 50
const COMPARISON_STATUSES = new Set(['passed', 'failed', 'created', 'updated'])
const COMPARISON_NAME = /^[A-Za-z0-9_/-]+$/
const COMPARISON_PREFIX = 'comparison:'

const nonNegative = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

const toSize = (v: unknown): [number, number] | null =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)
    ? [v[0], v[1]]
    : null

// run.json is untrusted: malformed entries are dropped, bad fields become null.
export const parseComparisons = (
  raw: unknown,
  attachments: RaiderAttachment[],
  resultsDir: string
): ScreenshotComparison[] => {
  if (!Array.isArray(raw)) return []
  const imagePath = (name: string, kind: string): string | undefined => {
    const wanted = `${COMPARISON_PREFIX}${name}:${kind}`
    // Later attachments win (rspec-retry repeats names).
    for (let i = attachments.length - 1; i >= 0; i--) {
      const a = attachments[i]
      if (a.name !== wanted) continue
      if (!a.content_type?.startsWith('image/') || typeof a.path !== 'string') return undefined
      const safe = safeAttachmentPath(a.path)
      return safe ? `${resultsDir}/${safe}` : undefined
    }
    return undefined
  }
  const out: ScreenshotComparison[] = []
  for (const entry of raw) {
    if (out.length >= MAX_COMPARISONS) break
    if (!isObject(entry)) continue
    const { name, status } = entry
    if (typeof name !== 'string' || name.length > 100 || !COMPARISON_NAME.test(name)) continue
    if (typeof status !== 'string' || !COMPARISON_STATUSES.has(status)) continue
    const images: ScreenshotComparison['images'] = {}
    for (const kind of ['expected', 'actual', 'diff'] as const) {
      const p = imagePath(name, kind)
      if (p) images[kind] = p
    }
    out.push({
      name,
      status: status as ComparisonStatus,
      baseline:
        typeof entry.baseline === 'string' && entry.baseline.length <= 300 ? entry.baseline : null,
      diffPixels: nonNegative(entry.diff_pixels),
      diffRatio: nonNegative(entry.diff_ratio),
      threshold: nonNegative(entry.threshold),
      maxDiffPixels: nonNegative(entry.max_diff_pixels),
      maxDiffRatio: nonNegative(entry.max_diff_ratio),
      expectedSize: toSize(entry.expected_size),
      actualSize: toSize(entry.actual_size),
      images
    })
  }
  return out
}

const toRow = (
  result: RaiderResult,
  resultsDir: string,
  browser?: string,
  finishedAt?: string
): TestResult => {
  const row: TestResult = {
    name: typeof result.full_name === 'string' ? result.full_name : '',
    status: mapStatus(typeof result.status === 'string' ? result.status : undefined)
  }
  const failure = isObject(result.failure) ? result.failure : undefined
  if (failure && typeof failure.message === 'string') {
    const message = sanitizeMessage(failure.message)
    row.statusDetails = { message }
    row.failure = {
      message,
      exceptionClass:
        typeof failure.exception_class === 'string' ? failure.exception_class : undefined,
      backtrace: Array.isArray(failure.backtrace)
        ? failure.backtrace.filter((l): l is string => typeof l === 'string')
        : [],
      appFrame: typeof failure.app_frame === 'string' ? failure.app_frame : undefined
    }
  }
  if (typeof result.identifier === 'string') row.identifier = result.identifier
  if (typeof result.file_path === 'string') row.file = result.file_path.replace(/^\.\//, '')
  if (typeof result.line_number === 'number') row.line = result.line_number
  if (typeof result.duration_ms === 'number') row.durationMs = result.duration_ms
  if (browser) row.browser = browser
  if (finishedAt) row.finishedAt = finishedAt
  const attachments = (Array.isArray(result.attachments) ? result.attachments : []).filter(
    (a) => isObject(a) && typeof a.content_type === 'string' && typeof a.path === 'string'
  )
  const images = attachments.filter(
    (a) => a.content_type?.startsWith('image/') && a.path && !a.name?.startsWith(COMPARISON_PREFIX)
  )
  const image = images.find((a) => a.name === 'screenshot') ?? images[0]
  const safe = image?.path ? safeAttachmentPath(image.path) : null
  if (safe) row.screenshot = `${resultsDir}/${safe}`
  const video = attachments.find((a) => a.content_type?.startsWith('video/') && a.path)
  const safeVideo = video?.path ? safeAttachmentPath(video.path) : null
  if (safeVideo) row.video = `${resultsDir}/${safeVideo}`
  const traces = attachments
    .filter((a) => a.content_type === TRACE_CONTENT_TYPE && a.path)
    .flatMap((a) => {
      const safeTrace = safeAttachmentPath(a.path as string)
      if (!safeTrace) return []
      const ref: TraceRef = { path: `${resultsDir}/${safeTrace}` }
      if (Number.isInteger(a.attempt) && (a.attempt as number) > 0) ref.attempt = a.attempt
      return [ref]
    })
    .sort((a, b) => (b.attempt ?? 0) - (a.attempt ?? 0))
  if (traces.length > 0) row.traces = traces
  const comparisons = parseComparisons(result.comparisons, attachments, resultsDir)
  if (comparisons.length > 0) row.comparisons = comparisons
  return row
}

interface Candidate {
  node: DirNode
  index: number | null // shard number from the file name; null for run.json
  results: RaiderResult[]
  finished: number // epoch ms, NaN when missing
  finishedAt?: string // raw run.finished_at
  total: number | null
  browser?: string
}

const fileIndex = (name: string): number | null | undefined => {
  if (name === 'run.json') return null
  const m = /^run-(\d+)\.json$/.exec(name)
  return m ? Number(m[1]) : undefined
}

// The gem only cleans its own file, so stale run files can sit beside fresh ones.
// Pick the newest run by finished_at; for shards keep only its sibling set.
const selectCandidates = (all: Candidate[]): Candidate[] => {
  const single = all.find((c) => c.index === null)
  const shards = all.filter((c) => c.index !== null).sort((a, b) => a.index! - b.index!)
  const ts = (c: Candidate): number => (Number.isNaN(c.finished) ? -Infinity : c.finished)
  const newestShard = shards.reduce<Candidate | undefined>(
    (best, c) => (!best || ts(c) > ts(best) ? c : best),
    undefined
  )
  if (single && (!newestShard || ts(newestShard) <= ts(single))) return [single]
  if (!newestShard) return []
  const total = newestShard.total
  if (total === null || ts(newestShard) === -Infinity) return shards
  return shards.filter((c) => c.index! <= total && c.total === total)
}

export const loadRaiderResults = async (
  projectPath: string,
  api: RaiderResultsApi,
  onError?: (file: string, message: string) => void
): Promise<TestResult[] | null> => {
  const resultsDir = `${projectPath}/raider-results`
  let nodes: DirNode[]
  try {
    nodes = await api.readDirectory(resultsDir)
  } catch {
    return null
  }
  const files = (nodes ?? []).filter(
    (n) => n.type === 'file' && n.path && fileIndex(n.name) !== undefined
  )
  if (files.length === 0) return null

  const parsed: Candidate[] = []
  for (const node of files) {
    const res = await api.readFile(node.path as string)
    if (!res.success || !res.data) {
      onError?.(node.name, res.error ?? 'could not read file')
      continue
    }
    try {
      const data = JSON.parse(res.data) as {
        run?: {
          finished_at?: string
          environment?: { browser?: unknown }
          shard?: { total?: number | null }
        }
        results?: RaiderResult[]
      }
      parsed.push({
        node,
        index: fileIndex(node.name) as number | null,
        results: Array.isArray(data.results) ? data.results.filter(isObject) : [],
        finished: data.run?.finished_at ? Date.parse(data.run.finished_at) : NaN,
        finishedAt: typeof data.run?.finished_at === 'string' ? data.run.finished_at : undefined,
        total: typeof data.run?.shard?.total === 'number' ? data.run.shard.total : null,
        browser:
          typeof data.run?.environment?.browser === 'string' && data.run.environment.browser
            ? data.run.environment.browser
            : undefined
      })
    } catch (e: unknown) {
      onError?.(node.name, (e as Error).message)
    }
  }
  if (parsed.length === 0) return null

  return selectCandidates(parsed).flatMap((c) =>
    c.results.map((r) => toRow(r, resultsDir, c.browser, c.finishedAt))
  )
}
