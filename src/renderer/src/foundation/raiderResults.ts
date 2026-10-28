// Reads raider_reporter's local output (raider-results/) into the shape the
// project dashboard already renders. Local only: no network access.

import type { TestResult } from './Types/testResult'

interface DirNode {
  name: string
  type: string
  path?: string
}

export interface RaiderResultsApi {
  readDirectory: (folderPath: string) => Promise<DirNode[]>
  readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
}

interface RaiderResult {
  full_name?: string
  status?: string
  duration_ms?: number
  failure?: {
    message?: string
    exception_class?: string
    backtrace?: string[]
    app_frame?: string
  }
  attachments?: { name?: string; content_type?: string; path?: string }[]
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

const toRow = (result: RaiderResult, resultsDir: string, browser?: string): TestResult => {
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
  if (typeof result.duration_ms === 'number') row.durationMs = result.duration_ms
  if (browser) row.browser = browser
  const attachments = (Array.isArray(result.attachments) ? result.attachments : []).filter(
    (a) => isObject(a) && typeof a.content_type === 'string' && typeof a.path === 'string'
  )
  const images = attachments.filter((a) => a.content_type?.startsWith('image/') && a.path)
  const image = images.find((a) => a.name === 'screenshot') ?? images[0]
  const safe = image?.path ? safeAttachmentPath(image.path) : null
  if (safe) row.screenshot = `${resultsDir}/${safe}`
  const video = attachments.find((a) => a.content_type?.startsWith('video/') && a.path)
  const safeVideo = video?.path ? safeAttachmentPath(video.path) : null
  if (safeVideo) row.video = `${resultsDir}/${safeVideo}`
  return row
}

interface Candidate {
  node: DirNode
  index: number | null // shard number from the file name; null for run.json
  results: RaiderResult[]
  finished: number // epoch ms, NaN when missing
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
    c.results.map((r) => toRow(r, resultsDir, c.browser))
  )
}
