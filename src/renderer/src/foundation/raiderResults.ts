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
  failure?: { message?: string; backtrace?: string[] }
  attachments?: { content_type?: string; path?: string }[]
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

// run.json is untrusted: only accept relative paths inside attachments[-<n>]/.
const safeAttachmentPath = (raw: string): string | null => {
  const p = raw.replace(/\\/g, '/')
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null
  const segments = p.split('/')
  if (segments.some((seg) => seg === '' || seg === '..' || seg === '.')) return null
  if (!/^attachments(-\d+)?$/.test(segments[0]) || segments.length < 2) return null
  return p
}

const toRow = (result: RaiderResult, resultsDir: string): TestResult => {
  const row: TestResult = {
    name: result.full_name ?? '',
    status: mapStatus(result.status)
  }
  if (result.failure?.message !== undefined) {
    const trace = (result.failure.backtrace ?? []).join('\n')
    row.statusDetails = {
      message: sanitizeMessage(
        trace ? `${result.failure.message}\n${trace}` : result.failure.message
      )
    }
  }
  const image = (result.attachments ?? []).find(
    (a) => a.content_type?.startsWith('image/') && a.path
  )
  const safe = image?.path ? safeAttachmentPath(image.path) : null
  if (safe) row.screenshot = `${resultsDir}/${safe}`
  const video = (result.attachments ?? []).find(
    (a) => a.content_type?.startsWith('video/') && a.path
  )
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
        run?: { finished_at?: string; shard?: { total?: number | null } }
        results?: RaiderResult[]
      }
      parsed.push({
        node,
        index: fileIndex(node.name) as number | null,
        results: Array.isArray(data.results) ? data.results : [],
        finished: data.run?.finished_at ? Date.parse(data.run.finished_at) : NaN,
        total: typeof data.run?.shard?.total === 'number' ? data.run.shard.total : null
      })
    } catch (e: unknown) {
      onError?.(node.name, (e as Error).message)
    }
  }
  if (parsed.length === 0) return null

  return selectCandidates(parsed).flatMap((c) => c.results.map((r) => toRow(r, resultsDir)))
}
