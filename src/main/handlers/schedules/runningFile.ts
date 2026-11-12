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

export type AcquireResult = { ok: true; lock: RunningLock | null } | { ok: false; name?: string }

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

/** Its JSON object; null when missing, a link, not a regular file, over 4 KB or not an object. */
export function readRunning(file: string): Record<string, unknown> | null {
  let fd: number
  try {
    // lstat first: O_NOFOLLOW does not exist on Windows
    if (!fs.lstatSync(file).isFile()) return null
    fd = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW | NONBLOCK)
  } catch {
    return null
  }
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > MAX_BYTES) return null
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0)
    if (read > MAX_BYTES) return null
    const data: unknown = JSON.parse(buffer.subarray(0, read).toString('utf8'))
    return isPlainObject(data) ? data : null
  } catch {
    return null
  } finally {
    fs.closeSync(fd)
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

/** Creates running.json exclusively; false when something is already there. Throws otherwise. */
function create(file: string, body: string): boolean {
  let fd: number
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW,
      0o600
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return false
    throw error
  }
  try {
    fs.writeSync(fd, body)
  } catch (error) {
    fs.closeSync(fd)
    fs.rmSync(file, { force: true })
    throw error
  }
  fs.closeSync(fd)
  return true
}

/**
 * Before an app run: refuses when another live run holds running.json; in a project with
 * .raider/schedules/schedules.yml, writes its own (replacing a stale one). Never creates
 * .raider/schedules. Anything it can't write or replace counts as busy (fail closed).
 */
export function acquireRunning(
  projectPath: string,
  deps: RunningDeps = defaultDeps()
): AcquireResult {
  const raider = path.join(projectPath, SCHEDULES_DIR[0])
  const dir = path.join(projectPath, ...SCHEDULES_DIR)
  if (!isRealDir(raider) || !isRealDir(dir)) return { ok: true, lock: null }
  const file = path.join(dir, RUNNING)
  const busy = liveOther(readRunning(file), deps)
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
    if (create(file, body)) return { ok: true, lock: { file, runId } }
    const seen = liveOther(readRunning(file), deps)
    if (seen) return { ok: false, ...seen }
    // Stale (dead pid, our own leftover, unreadable): replace it once
    fs.unlinkSync(file)
    if (create(file, body)) return { ok: true, lock: { file, runId } }
  } catch (error) {
    safeWarn('Could not write .raider/schedules/running.json:', String(error))
  }
  return { ok: false }
}

/** Removes running.json if it still holds this run's run_id. Never throws. */
export function releaseRunning(lock: RunningLock): void {
  try {
    if (readRunning(lock.file)?.run_id === lock.runId) fs.unlinkSync(lock.file)
  } catch (error) {
    safeWarn('Could not remove .raider/schedules/running.json:', String(error))
  }
}
