import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { isScheduleName } from '../../../shared/schedules'
import { safeWarn } from '../../utils/safeLog'

// .raider/schedules/running.json: who is running the project's tests now, shared with the
// gem's scheduled-run wrapper (ruby_raider 4.2 RunLock). {pid, name, run_id, started_at};
// a live pid that is not ours means busy. Read and written only as a small regular file
// (O_NOFOLLOW, O_EXCL on create, 0600); its pid is only checked with kill(pid, 0), never
// signalled. Synchronous on purpose: the file is ≤ 4 KB, and the quit path can't await.

const MAX_BYTES = 4096
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0
const NONBLOCK = fs.constants.O_NONBLOCK ?? 0
const SCHEDULES_DIR = ['.raider', 'schedules']
const RUNNING = 'running.json'
const RULES = 'schedules.yml'

export interface RunningDeps {
  pid: number
  isAlive(pid: number): boolean
}

/** Held while an app run owns running.json; release removes it only if still ours. */
export interface RunningLock {
  file: string
  runId: string
}

/** `writeFailed`: running.json could not be written at all (not busy), so the run must not start. */
export type AcquireResult =
  | { ok: true; lock: RunningLock | null }
  | { ok: false; name?: string }
  | { ok: false; writeFailed: true }

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException)?.code

/** kill(pid, 0) only checks: EPERM means alive but not ours to signal. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

const defaultDeps = (): RunningDeps => ({ pid: process.pid, isAlive: pidAlive })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Where a path's file is: same dev + ino means the same file (never through a link). */
export type FileId = readonly [dev: number, ino: number]

/**
 * What is at running.json now: its identity (lstat), its JSON object when it is a small
 * regular file, and `changed` when it was swapped between the lstat and the open. null when
 * there is none. Mirrors the gem's RunLock#inspect_running.
 */
export function inspectRunning(
  file: string
): { id: FileId; data: Record<string, unknown> | null; changed: boolean } | null {
  let id: FileId
  let regular: boolean
  try {
    const stat = fs.lstatSync(file)
    id = [stat.dev, stat.ino]
    regular = stat.isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    return { id: [-1, -1], data: null, changed: true }
  }
  if (!regular) return { id, data: null, changed: false }
  let fd: number
  try {
    // O_NOFOLLOW (POSIX) and the lstat above: never through a link; O_NONBLOCK: a fifo can't hang
    fd = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW | NONBLOCK)
  } catch {
    return { id, data: null, changed: true }
  }
  try {
    const stat = fs.fstatSync(fd)
    if (stat.dev !== id[0] || stat.ino !== id[1]) return { id, data: null, changed: true }
    if (!stat.isFile() || stat.size > MAX_BYTES) return { id, data: null, changed: false }
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0)
    if (read > MAX_BYTES) return { id, data: null, changed: false }
    const data: unknown = JSON.parse(buffer.subarray(0, read).toString('utf8'))
    return { id, data: isPlainObject(data) ? data : null, changed: false }
  } catch {
    return { id, data: null, changed: false }
  } finally {
    fs.closeSync(fd)
  }
}

/** Its JSON object; null when missing, a link, not a regular file, over 4 KB or not an object. */
export function readRunning(file: string): Record<string, unknown> | null {
  return inspectRunning(file)?.data ?? null
}

const sameId = (stat: fs.Stats, id: FileId): boolean => stat.dev === id[0] && stat.ino === id[1]

/**
 * Removes the file at `file` only if it is still the one with `id`: moves it aside, compares,
 * and puts back (link never replaces a newer one) whatever was written there meanwhile. Without
 * hard links it is renamed back, only while the path is still free. true when it is gone.
 * Mirrors the gem's RunLock#remove_stale.
 */
export function removeIfSame(file: string, id: FileId): boolean {
  const aside = `${file}.${randomBytes(6).toString('hex')}.stale`
  try {
    fs.renameSync(file, aside)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true
    throw error
  }
  if (sameId(fs.lstatSync(aside), id)) {
    try {
      fs.unlinkSync(aside)
    } catch (error) {
      // Not removable (a directory): put it back as it was
      fs.renameSync(aside, file)
      throw error
    }
    return true
  }
  try {
    fs.linkSync(aside, file)
  } catch (error) {
    // EEXIST: a newer running.json is there already. Else no hard links on this volume: rename
    // it back while nothing took its place (rename would replace a newer one)
    if (errorCode(error) !== 'EEXIST' && !exists(file)) {
      fs.renameSync(aside, file)
      return false
    }
  }
  fs.unlinkSync(aside)
  return false
}

const exists = (file: string): boolean => {
  try {
    fs.lstatSync(file)
    return true
  } catch (error) {
    return errorCode(error) !== 'ENOENT'
  }
}

/** The run named in `data` when it is another live process; else null (stale or none). */
function liveOther(
  data: Record<string, unknown> | null,
  deps: RunningDeps
): { name?: string } | null {
  const pid = data?.pid
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return null
  if (pid === deps.pid || !deps.isAlive(pid)) return null
  const name = data?.name
  return typeof name === 'string' && isScheduleName(name) ? { name } : {}
}

const isRealDir = (dir: string): boolean => {
  try {
    return fs.lstatSync(dir).isDirectory()
  } catch {
    return false
  }
}

const isRegularFile = (file: string): boolean => {
  try {
    return fs.lstatSync(file).isFile()
  } catch {
    return false
  }
}

/** Creates `file` (O_EXCL, O_NOFOLLOW, 0600) holding `body`. Throws EEXIST when one is there. */
function createExclusive(file: string, body: string): void {
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW,
    0o600
  )
  let id: FileId | null = null
  try {
    const stat = fs.fstatSync(fd)
    id = [stat.dev, stat.ino]
    fs.writeSync(fd, body)
  } catch (error) {
    fs.closeSync(fd)
    // Ours but not written: remove it while it is still ours, then fail
    if (id) {
      try {
        removeIfSame(file, id)
      } catch {
        // left for the next stale check
      }
    }
    throw error
  }
  fs.closeSync(fd)
}

/**
 * Publishes running.json complete: writes a 0600 temp file beside it, then links it into place,
 * which fails like O_EXCL when one is there; so no reader sees it empty. Where the volume has
 * no hard links (FAT, exFAT, some SMB) it falls back to the gem's own direct O_EXCL create.
 * false when something was there; throws when running.json can't be written at all.
 */
export function publishRunning(file: string, body: string): boolean {
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`
  let tempMade = false
  try {
    createExclusive(temp, body)
    tempMade = true
    fs.linkSync(temp, file)
    return true
  } catch (error) {
    if (tempMade && errorCode(error) === 'EEXIST') return false
    // No hard links here (or no temp file): fall through to the direct create
  } finally {
    if (tempMade) {
      try {
        fs.rmSync(temp, { force: true })
      } catch (error) {
        // A leftover temp must not hide a published running.json
        safeWarn('Could not remove a temp file beside running.json:', String(error))
      }
    }
  }
  try {
    createExclusive(file, body)
    return true
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false
    throw error
  }
}

/**
 * Before an app run: refuses when another live run holds running.json; in a project with
 * .raider/schedules/schedules.yml, writes its own (replacing a stale one). Never creates
 * .raider/schedules. Anything it can't replace counts as busy; a running.json it can't write
 * at all is `writeFailed`. Either way the run doesn't start (fail closed).
 */
export function acquireRunning(
  projectPath: string,
  deps: RunningDeps = defaultDeps()
): AcquireResult {
  const raider = path.join(projectPath, SCHEDULES_DIR[0])
  const dir = path.join(projectPath, ...SCHEDULES_DIR)
  if (!isRealDir(raider) || !isRealDir(dir)) return { ok: true, lock: null }
  const file = path.join(dir, RUNNING)
  const seen = inspectRunning(file)
  const busy = liveOther(seen?.data ?? null, deps)
  if (busy) return { ok: false, ...busy }
  if (!isRegularFile(path.join(dir, RULES))) return { ok: true, lock: null }

  const runId = randomBytes(8).toString('hex')
  const body = JSON.stringify({
    pid: deps.pid,
    name: 'desktop',
    run_id: runId,
    started_at: new Date().toISOString()
  })
  try {
    // Swapped while read: someone is writing it now
    if (seen?.changed) return { ok: false }
    // Stale (dead pid, our own leftover, unreadable, a link): removed only if still that file
    if (seen && !removeIfSame(file, seen.id)) return { ok: false }
  } catch (error) {
    safeWarn('Could not replace .raider/schedules/running.json:', String(error))
    return { ok: false }
  }
  try {
    return publishRunning(file, body) ? { ok: true, lock: { file, runId } } : { ok: false }
  } catch (error) {
    safeWarn('Could not write .raider/schedules/running.json:', String(error))
    return { ok: false, writeFailed: true }
  }
}

/** Removes running.json if it is still the file holding this run's run_id. Never throws. */
export function releaseRunning(lock: RunningLock): void {
  try {
    const seen = inspectRunning(lock.file)
    if (seen && !seen.changed && seen.data?.run_id === lock.runId) removeIfSame(lock.file, seen.id)
  } catch (error) {
    safeWarn('Could not remove .raider/schedules/running.json:', String(error))
  }
}
