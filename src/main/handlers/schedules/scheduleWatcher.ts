import { constants, watch as fsWatch, promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { Notification } from 'electron'
import yaml from 'js-yaml'
import { appState } from '../appState'
import { assertRealInside, resolveInside } from '../tests/sidecar'
import { readRunLog } from './runLog'
import { isPlainObject, isScheduleName } from '../../../shared/schedules'

// Scheduled runs (`raider schedule run`, ruby_raider 4.2) append one line per run to
// .raider/schedules/<name>/runs.jsonl while the app is open. The open project's
// .raider/schedules/ is watched: each settled change tells the renderer, a new scheduled run
// that wrote results tells the Dashboard, and a new failed one of a schedule with notify off
// shows a banner (the gem notifies itself when notify is on). The log and schedules.yml are
// written by project code, so only the folder's schedule name and plain integers ever reach
// the banner.

/** Shown by the banner for a scheduled run that failed */
export const SCHEDULE_FAILED_TITLE = 'Scheduled run failed'
const testsFailed = (name: string, failed: number, total: number): string =>
  `${name}: ${failed} of ${total} ${total === 1 ? 'test' : 'tests'} failed`
const couldNotStart = (name: string): string => `${name} could not start`
const failedPlain = (name: string): string => `${name} failed`

const DEBOUNCE_MS = 300
/** Only the log's tail is read for new runs */
const MAX_SCAN_BYTES = 256 * 1024
/** Keys kept per schedule; the gem keeps 50 lines, so this only bounds a hostile log */
const MAX_SEEN = 500
const RUN_ID = /^[0-9a-f]{16}$/
const BANNER_STATUSES = ['failed', 'setup_error']
/** The statuses whose run wrote raider-results (busy only says another run held the lock) */
const RESULT_STATUSES = ['passed', 'failed', 'setup_error']
const SCHEDULES_DIR = '.raider/schedules'
const SCHEDULES_REL = `${SCHEDULES_DIR}/schedules.yml`
const MAX_SCHEDULES_BYTES = 256 * 1024

export interface WatchHandle {
  close(): void
  on(event: 'error', listener: (error: Error) => void): unknown
}
export interface NotificationHandle {
  on(event: 'click' | 'close', listener: () => void): unknown
  show(): void
  close(): void
}
export interface WindowHandle {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  webContents: { isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void }
}
export interface ScheduleWatcherDeps {
  /** `listener` gets the changed path relative to `dir`, or null when the platform omits it */
  watch: (
    dir: string,
    options: { recursive: boolean },
    listener: (filename: string | null) => void
  ) => WatchHandle
  notifications: {
    isSupported(): boolean
    create(options: { title: string; body: string }): NotificationHandle
  }
  mainWindow: () => WindowHandle | null
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
}

export interface ScheduleWatcher {
  readonly projectPath: string
  stop(): void
  /** Resolves once the work queued so far (arming, scans) is done */
  idle(): Promise<void>
}

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

/** The banner text for a run line of the schedule `name` (a valid schedule name). */
export function scheduleFailedBody(name: string, line: Record<string, unknown>): string {
  if (line.status === 'setup_error') return couldNotStart(name)
  const counts = isPlainObject(line.counts) ? line.counts : {}
  const { failed, total } = counts
  if (isCount(failed) && isCount(total) && failed > 0 && failed <= total)
    return testsFailed(name, failed, total)
  return failedPlain(name)
}

/** What makes a run line unique: its run id, else its start time within the schedule */
function lineKey(name: string, line: Record<string, unknown>): string | null {
  if (typeof line.run_id === 'string' && RUN_ID.test(line.run_id)) return line.run_id
  if (typeof line.started_at === 'string') return `${name}\n${line.started_at}`
  return null
}

const isScheduledWith = (line: Record<string, unknown>, statuses: string[]): boolean =>
  line.trigger === 'schedule' && typeof line.status === 'string' && statuses.includes(line.status)

/**
 * Whether a change under .raider/schedules/ can change what the schedules show: a run log,
 * schedules.yml, or a schedule's folder coming or going. running.json, run.lock, the logs'
 * locks, the report copies (<name>/last/), scheduler.log and temp files churn on every run and
 * are ignored. Without a filename (some platforms) it always counts.
 */
export function isScheduleChange(filename: string | null): boolean {
  if (filename === null) return true
  const parts = filename.split(/[\\/]/)
  if (parts.length === 1) return parts[0] === 'schedules.yml' || isScheduleName(parts[0])
  return parts.length === 2 && isScheduleName(parts[0]) && parts[1] === 'runs.jsonl'
}

/**
 * Each schedule's notify, from the gem's .raider/schedules/schedules.yml
 * (`schedules: [{ name, notify, ... }]`, written by YAML.dump, always with notify). Only a
 * boolean counts; a name listed twice that disagrees reads as true (no banner). Empty when the
 * file is missing, a link, too big, outside the project or unreadable.
 */
export async function readScheduleNotify(projectPath: string): Promise<Map<string, boolean>> {
  const notify = new Map<string, boolean>()
  let handle: fs.FileHandle | undefined
  try {
    const file = resolveInside(projectPath, SCHEDULES_REL)
    await assertRealInside(projectPath, file)
    if ((await fs.lstat(file)).isSymbolicLink()) return notify
    handle = await fs.open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_SCHEDULES_BYTES) return notify
    const buffer = Buffer.alloc(stat.size)
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0)
    const parsed = yaml.load(buffer.subarray(0, bytesRead).toString('utf8'), {
      schema: yaml.CORE_SCHEMA
    })
    const entries = isPlainObject(parsed) ? parsed.schedules : null
    if (!Array.isArray(entries)) return notify
    for (const entry of entries) {
      if (!isPlainObject(entry) || typeof entry.name !== 'string' || !isScheduleName(entry.name))
        continue
      if (typeof entry.notify !== 'boolean') continue
      notify.set(entry.name, (notify.get(entry.name) ?? false) || entry.notify)
    }
    return notify
  } catch {
    return notify
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

const lstatOrNull = (file: string): Promise<Stats | null> => fs.lstat(file).catch(() => null)

export function createScheduleWatcher(
  projectPath: string,
  deps: ScheduleWatcherDeps
): ScheduleWatcher {
  const raiderDir = path.join(projectPath, '.raider')
  const jobsDir = path.join(projectPath, SCHEDULES_DIR)
  const seen = new Map<string, Set<string>>()
  // Banners are kept until clicked or closed, or their click handler can be collected
  const shown = new Set<NotificationHandle>()
  let handle: WatchHandle | null = null
  let watchingJobs = false
  // Whether the last settle (or the start) found .raider/schedules/ to watch; an error closes
  // the watch first, so this is what tells a folder that went away from one never there
  let hadJobs = false
  let timer: unknown = null
  let stopped = false
  let queue: Promise<void> = Promise.resolve()

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(() => (stopped ? undefined : work())).catch(() => undefined)
  }

  const closeHandle = (): void => {
    handle?.close()
    handle = null
    watchingJobs = false
  }

  const schedule = (): void => {
    if (stopped) return
    if (timer !== null) deps.clearTimer(timer)
    timer = deps.setTimer(() => {
      timer = null
      enqueue(settle)
    }, DEBOUNCE_MS)
  }

  /** Watches `dir`; `counts` says which reported names matter */
  const watchDir = (
    dir: string,
    recursive: boolean,
    counts: (filename: string | null) => boolean
  ): boolean => {
    // An arm still awaiting when the project switched must not leave a watch behind
    if (stopped) return false
    try {
      handle = deps.watch(dir, { recursive }, (filename) => {
        if (counts(filename)) schedule()
      })
      // A watched folder that goes away errors: arm again from what is there now
      handle.on('error', () => {
        closeHandle()
        schedule()
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * A parent watch (waiting for .raider or schedules) settles on any change: platforms report
   * the new entry under its own name, the watched folder's name or none. A settle there is a
   * few lstats and pushes nothing until the folder is watched.
   */
  const anyChange = (): boolean => true

  /**
   * Whether .raider/schedules/ is a real folder of this project: no link on the way (.raider
   * or schedules itself), and its real path is the project's own. Checked before every read.
   */
  const jobsDirIsReal = async (): Promise<boolean> => {
    const [raider, jobs] = await Promise.all([lstatOrNull(raiderDir), lstatOrNull(jobsDir)])
    if (!raider?.isDirectory() || !jobs?.isDirectory()) return false
    const [realProject, realJobs] = await Promise.all([
      fs.realpath(projectPath),
      fs.realpath(jobsDir)
    ]).catch(() => [null, null])
    return realProject !== null && realJobs === path.join(realProject, '.raider', 'schedules')
  }

  /** Watches .raider/schedules/ when it is a real folder in the project, else waits for it */
  const arm = async (): Promise<void> => {
    closeHandle()
    const raider = await lstatOrNull(raiderDir)
    if (!raider) {
      if (!stopped && watchDir(projectPath, false, anyChange) && (await lstatOrNull(raiderDir)))
        schedule()
      return
    }
    // A link (or a file) is never followed
    if (!raider.isDirectory()) return
    const jobs = await lstatOrNull(jobsDir)
    if (!jobs) {
      if (!stopped && watchDir(raiderDir, false, anyChange) && (await lstatOrNull(jobsDir)))
        schedule()
      return
    }
    if (stopped) return
    // A linked .raider/schedules/ is never watched or read; .raider is, for it to be replaced
    if (!(await jobsDirIsReal())) {
      if (!stopped) watchDir(raiderDir, false, anyChange)
      return
    }
    watchingJobs = watchDir(jobsDir, true, isScheduleChange)
  }

  /** Schedule folders: real folders (never links) with a valid schedule name */
  const jobNames = async (): Promise<string[]> => {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isDirectory() && isScheduleName(e.name)).map((e) => e.name)
  }

  const banner = (name: string, line: Record<string, unknown>): void => {
    if (!deps.notifications.isSupported()) return
    const notification = deps.notifications.create({
      title: SCHEDULE_FAILED_TITLE,
      body: scheduleFailedBody(name, line)
    })
    shown.add(notification)
    notification.on('click', () => {
      shown.delete(notification)
      // After a project switch this banner is another project's: it must not open the new one's tab
      if (!stopped) focusSchedules()
    })
    notification.on('close', () => shown.delete(notification))
    notification.show()
  }

  const send = (channel: string, ...args: unknown[]): void => {
    const win = deps.mainWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
      win.webContents.send(channel, ...args)
  }

  const focusSchedules = (): void => {
    const win = deps.mainWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    send('focus-schedules')
  }

  /**
   * Reads each schedule's log and remembers its lines; with `announce`, lines not seen before
   * are news: a scheduled run that wrote results reloads the Dashboard (once per scan), and a
   * failed one of a schedule with notify off shows a banner. Keys are only ever added (oldest
   * dropped past the cap), so a log caught mid-rewrite never makes old lines new again.
   */
  const scan = async (announce: boolean): Promise<void> => {
    if (!(await jobsDirIsReal())) return
    // Read once per scan, and only when a new scheduled failure needs it
    let notify: Map<string, boolean> | null = null
    let finished = false
    for (const name of await jobNames()) {
      const lines = await readRunLog(projectPath, name, MAX_SCAN_BYTES)
      if (stopped) return
      const keys = seen.get(name) ?? new Set<string>()
      seen.set(name, keys)
      // Only the newest MAX_SEEN keyed lines count, seeding or not: an older line past the
      // cap would be forgotten each scan and look new again
      const keyed = lines.flatMap((line) => {
        if (!isPlainObject(line)) return []
        const key = lineKey(name, line)
        return key === null ? [] : [{ key, line }]
      })
      let failure: Record<string, unknown> | null = null
      for (const { key, line } of keyed.slice(-MAX_SEEN)) {
        if (keys.delete(key)) {
          keys.add(key)
          continue
        }
        keys.add(key)
        if (!announce) continue
        if (isScheduledWith(line, RESULT_STATUSES)) finished = true
        // At most one banner per schedule per scan: its newest new failure
        if (isScheduledWith(line, BANNER_STATUSES)) failure = line
      }
      for (const key of keys) {
        if (keys.size <= MAX_SEEN) break
        keys.delete(key)
      }
      if (failure === null) continue
      notify ??= await readScheduleNotify(projectPath)
      if (stopped) return
      // Unknown schedule or notify on (the gem shows its own): no banner
      if (notify.get(name) !== false) continue
      banner(name, failure)
    }
    // At most one per scan, whatever the number of new lines
    if (finished && !stopped) send('scheduled-run-finished', projectPath)
  }

  const settle = async (): Promise<void> => {
    if (!watchingJobs || !(await jobsDirIsReal())) await arm()
    const had = hadJobs
    hadJobs = watchingJobs
    // Still waiting for the folder: nothing the schedules show has changed
    if (stopped || (!had && !watchingJobs)) return
    send('schedules-changed')
    await scan(true)
  }

  // Lines already in the logs when watching starts are not news
  enqueue(async () => {
    await arm()
    hadJobs = watchingJobs
    await scan(false)
  })

  return {
    projectPath,
    stop: (): void => {
      stopped = true
      if (timer !== null) deps.clearTimer(timer)
      timer = null
      closeHandle()
      // This project's banners go with it
      for (const notification of Array.from(shown)) notification.close()
      shown.clear()
    },
    idle: (): Promise<void> => queue
  }
}

const defaultDeps = (): ScheduleWatcherDeps => ({
  watch: (dir, options, listener) =>
    fsWatch(dir, options, (_event, filename) => listener(filename ?? null)),
  notifications: {
    isSupported: () => Notification.isSupported(),
    create: (options) => new Notification(options)
  },
  mainWindow: () => appState.mainWindow,
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
})

let current: ScheduleWatcher | null = null

/** Watches the scheduled jobs of the open project; a different project's watcher is closed first. */
export function startScheduleWatcher(
  projectPath: string,
  deps: ScheduleWatcherDeps = defaultDeps()
): void {
  if (current?.projectPath === projectPath) return
  stopScheduleWatcher()
  current = createScheduleWatcher(projectPath, deps)
}

export function stopScheduleWatcher(): void {
  current?.stop()
  current = null
}
