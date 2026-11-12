import { constants, promises as fs } from 'node:fs'
import { assertRealInside, resolveInside } from '../tests/sidecar'
import { isScheduleName } from '../../../shared/schedules'
import { parseLastRun } from '../gem/gemJson'
import type { ScheduledLastRun } from '../../../shared/types/schedules'

// The gem's run log of a schedule (.raider/schedules/<name>/runs.jsonl, one JSON line per
// run). It is written by project code, so nothing is trusted: each line is parsed on its own.

/** Only the log's tail is read; the gem trims it to 50 lines anyway */
const MAX_LOG_BYTES = 1024 * 1024
/** The last run needs only the last line: a small tail, read once per listed schedule */
const LAST_RUN_BYTES = 64 * 1024

/**
 * Where run logs live: 4.2's folder, or 4.1's for the watcher until it moves (Task 5). A
 * constant from main, never a value from the renderer.
 */
export type RunLogDir = '.raider/schedules' | '.raider/flows'

const runLogRel = (dir: RunLogDir, name: string): string => `${dir}/${name}/runs.jsonl`

/**
 * The log's lines, oldest first, each parsed on its own (a bad line is skipped). Empty when
 * the log is missing, unreadable, a link, or outside the project.
 */
export async function readRunLog(
  projectPath: string,
  name: string,
  maxBytes = MAX_LOG_BYTES,
  dir: RunLogDir = '.raider/schedules'
): Promise<unknown[]> {
  if (!isScheduleName(name)) return []
  let handle: fs.FileHandle | undefined
  try {
    const file = resolveInside(projectPath, runLogRel(dir, name))
    await assertRealInside(projectPath, file)
    // O_NOFOLLOW refuses a link where it exists; the lstat covers platforms without it
    if ((await fs.lstat(file)).isSymbolicLink()) return []
    handle = await fs.open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    const stat = await handle.stat()
    if (!stat.isFile()) return []
    const length = Math.min(stat.size, maxBytes)
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
 * The schedule's last run from its log's last line (a busy line too, which the gem's list
 * skips); null without a log or when that line doesn't fit.
 */
export async function lastRunFromLog(
  projectPath: string,
  name: string
): Promise<ScheduledLastRun | null> {
  const lines = await readRunLog(projectPath, name, LAST_RUN_BYTES)
  return lines.length === 0 ? null : parseLastRun(lines[lines.length - 1])
}
