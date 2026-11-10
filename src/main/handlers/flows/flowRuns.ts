import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { assertRealInside, resolveInside } from '../tests/sidecar'
import {
  FLOW_RESULTS_ROOT,
  flowOfResultsDir,
  isFlowName,
  isPlainObject
} from '../../../shared/flows'
import type { FlowFailedStep, FlowLastResults, FlowLastRun } from '../../../shared/types/flows'

// The gem's run log of a flow (.raider/flows/<name>/runs.jsonl, one JSON line per run) and the
// results folder each line names. Both are written by project code, so nothing is trusted:
// every line is checked on its own and a results folder must really be that flow's.

/** Only the log's tail is read; the gem trims it to 50 lines anyway */
const MAX_LOG_BYTES = 1024 * 1024
const MAX_TITLE = 500
const RUN_ID = /^[0-9a-f]{16}$/
const STATUSES: readonly FlowLastRun['status'][] = ['completed', 'failed', 'setup_error', 'busy']

export interface FlowRunRecord {
  runId: string | null
  status: FlowLastRun['status']
  finishedAt: string | null
  /** Project-relative `flow-results/<name>/<stamp>`; null when missing or not that flow's own folder */
  resultsDir: string | null
  failedStep: FlowFailedStep | null
}

const runLogRel = (name: string): string => `.raider/flows/${name}/runs.jsonl`

const isPositiveInt = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0

/**
 * The log's lines, oldest first, each parsed on its own (a bad line is skipped). Empty when
 * the log is missing, unreadable, a link, or outside the project.
 */
export async function readRunLog(projectPath: string, name: string): Promise<unknown[]> {
  if (!isFlowName(name)) return []
  let handle: fs.FileHandle | undefined
  try {
    const file = resolveInside(projectPath, runLogRel(name))
    await assertRealInside(projectPath, file)
    // O_NOFOLLOW refuses a link where it exists; the lstat covers platforms without it
    if ((await fs.lstat(file)).isSymbolicLink()) return []
    handle = await fs.open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    const stat = await handle.stat()
    if (!stat.isFile()) return []
    const length = Math.min(stat.size, MAX_LOG_BYTES)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, stat.size - length)
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n')
    // A tail read starts mid-line
    if (stat.size > length) lines.shift()
    return lines.flatMap((line) => {
      if (line.trim() === '') return []
      try {
        return [JSON.parse(line) as unknown]
      } catch {
        return []
      }
    })
  } catch {
    return []
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/**
 * `rel` when it is `flow-results/<name>/<stamp>` and its real path is exactly that folder
 * under the project's real path (no link anywhere on the way), else null.
 */
export async function realResultsDir(
  projectPath: string,
  name: string,
  rel: unknown
): Promise<string | null> {
  if (flowOfResultsDir(rel, name) === null) return null
  const dir = rel as string
  try {
    const expected = path.join(await fs.realpath(projectPath), FLOW_RESULTS_ROOT, name)
    const real = await fs.realpath(resolveInside(projectPath, dir))
    if (real !== path.join(expected, path.posix.basename(dir))) return null
    return (await fs.stat(real)).isDirectory() ? dir : null
  } catch {
    return null
  }
}

function parseFailedStep(value: unknown): FlowFailedStep | null {
  if (!isPlainObject(value)) return null
  const { number, title, line } = value
  if (typeof title !== 'string' || title.length > MAX_TITLE || !isPositiveInt(line)) return null
  if (number !== undefined && !isPositiveInt(number)) return null
  return number === undefined ? { title, line } : { number, title, line }
}

const parseTime = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null

const statusOf = (line: unknown): FlowLastRun['status'] | null =>
  isPlainObject(line) && STATUSES.includes(line.status as FlowLastRun['status'])
    ? (line.status as FlowLastRun['status'])
    : null

/** One log line, checked; null when it has no known status. */
export async function parseRunLine(
  projectPath: string,
  name: string,
  line: unknown
): Promise<FlowRunRecord | null> {
  const status = statusOf(line)
  if (!status || !isPlainObject(line)) return null
  return {
    runId: typeof line.run_id === 'string' && RUN_ID.test(line.run_id) ? line.run_id : null,
    status,
    finishedAt: parseTime(line.finished_at),
    resultsDir: await realResultsDir(projectPath, name, line.results_dir),
    failedStep: parseFailedStep(line.failed_step)
  }
}

/** The log line of the run with this id (never simply the last line), or null. */
export async function flowRunById(
  projectPath: string,
  name: string,
  runId: string
): Promise<FlowRunRecord | null> {
  const lines = await readRunLog(projectPath, name)
  const ours = lines.filter((line) => isPlainObject(line) && line.run_id === runId)
  if (ours.length === 0) return null
  return parseRunLine(projectPath, name, ours[ours.length - 1])
}

/**
 * The results of the flow's newest run that did run (a `busy` line is skipped). Null when
 * that line names no valid results folder: an older run's results would be stale.
 */
export async function lastFlowResults(
  projectPath: string,
  name: string
): Promise<FlowLastResults | null> {
  const lines = await readRunLog(projectPath, name)
  const last = lines.findLast((line) => {
    const status = statusOf(line)
    return status !== null && status !== 'busy'
  })
  if (last === undefined) return null
  const record = await parseRunLine(projectPath, name, last)
  if (!record?.resultsDir || !record.finishedAt) return null
  return { resultsDir: record.resultsDir, finishedAt: record.finishedAt, status: record.status }
}
