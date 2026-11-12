import { constants, watch as fsWatch, promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { Notification } from 'electron'
import yaml from 'js-yaml'
import { appState } from '../appState'
import { assertRealInside, resolveInside } from '../tests/sidecar'
import { readRunLog } from './runLog'
import { isScheduleName } from '../../../shared/schedules'
import { isPlainObject } from '../../../shared/schedules'

// Scheduled runs (launchd) append to .raider/flows/<name>/runs.jsonl while the app is open.
// The open project's .raider/flows/ is watched: each settled change tells the renderer
// and a new scheduled run that failed shows a notification. The log is written by project
// code, so only the folder's schedule name and plain integers ever reach the notification.

/** Shown by the notification for a scheduled run that failed */
export const SCHEDULE_FAILED_TITLE = 'Scheduled run failed'
const failedAtStep = (name: string, step: number): string => `${name} failed at step ${step}`
const failedAtLine = (name: string, line: number): string => `${name} failed at line ${line}`
const couldNotStart = (name: string): string => `${name} could not start`
const failed = (name: string): string => `${name} failed`

const DEBOUNCE_MS = 300
/** Only the log's tail is read for new runs */
const MAX_SCAN_BYTES = 256 * 1024
/** Keys kept per schedule; the gem keeps 50 lines, so this only bounds a hostile log */
const MAX_SEEN = 500
const RUN_ID = /^[0-9a-f]{16}$/
const NOTIFY_STATUSES = ['failed', 'setup_error']
const SCHEDULES_REL = '.raider/flows/schedules.yml'
const MAX_SCHEDULES_BYTES = 256 * 1024
const MAX_RETRIES = 3

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
  webContents: { isDestroyed(): boolean; send(channel: string): void }
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

const isPositiveInt = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

/** The notification text for a run line of the schedule `name` (a valid schedule name). */
export function scheduleFailedBody(name: string, line: Record<string, unknown>): string {
  const step = isPlainObject(line.failed_step) ? line.failed_step : {}
  if (isPositiveInt(step.number)) return failedAtStep(name, step.number)
  if (isPositiveInt(step.line)) return failedAtLine(name, step.line)
  return line.status === 'setup_error' ? couldNotStart(name) : failed(name)
}

/** What makes a run line unique: its run id, else its start time within the schedule */
function lineKey(name: string, line: Record<string, unknown>): string | null {
  if (typeof line.run_id === 'string' && RUN_ID.test(line.run_id)) return line.run_id
  if (typeof line.started_at === 'string') return `${name}\n${line.started_at}`
  return null
}

const isScheduledFailure = (line: Record<string, unknown>): boolean =>
  line.trigger === 'schedule' &&
  typeof line.status === 'string' &&
  NOTIFY_STATUSES.includes(line.status)

/**
 * Whether a change under .raider/flows/ can change what the schedules show: a run log, the
 * schedules, or a job's folder coming or going. scheduler.log, locks, env and temp files churn
 * on every run and are ignored. Without a filename (some platforms) it always counts.
 */
export function isScheduleChange(filename: string | null): boolean {
  if (filename === null) return true
  const parts = filename.split(/[\\/]/)
  if (parts.length === 1) return parts[0] === 'schedules.yml' || isScheduleName(parts[0])
  return parts.length === 2 && isScheduleName(parts[0]) && parts[1] === 'runs.jsonl'
}

/**
 * The retries of each scheduled job, from the gem's .raider/flows/schedules.yml
 * (`schedules: [{ name, retries, ... }]`), clamped to 0..3. Empty when the file is missing,
 * a link, too big, outside the project or unreadable.
 */
export async function readScheduleRetries(projectPath: string): Promise<Map<string, number>> {
  const retries = new Map<string, number>()
  let handle: fs.FileHandle | undefined
  try {
    const file = resolveInside(projectPath, SCHEDULES_REL)
    await assertRealInside(projectPath, file)
    if ((await fs.lstat(file)).isSymbolicLink()) return retries
    handle = await fs.open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_SCHEDULES_BYTES) return retries
    const text = (await handle.readFile()).toString('utf8')
    const parsed = yaml.load(text, { schema: yaml.CORE_SCHEMA })
    const entries = isPlainObject(parsed) ? parsed.schedules : null
    if (!Array.isArray(entries)) return retries
    for (const entry of entries) {
      if (!isPlainObject(entry) || typeof entry.name !== 'string' || !isScheduleName(entry.name))
        continue
      const value = Number.isSafeInteger(entry.retries) ? (entry.retries as number) : 0
      retries.set(entry.name, Math.min(Math.max(value, 0), MAX_RETRIES))
    }
    return retries
  } catch {
    return retries
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** The gem notifies after a scheduled run's last attempt only; so does the app */
const isFinalAttempt = (line: Record<string, unknown>, retries: number): boolean =>
  isPositiveInt(line.attempt) && line.attempt >= retries + 1

const lstatOrNull = (file: string): Promise<Stats | null> => fs.lstat(file).catch(() => null)

export function createScheduleWatcher(
  projectPath: string,
  deps: ScheduleWatcherDeps
): ScheduleWatcher {
  const raiderDir = path.join(projectPath, '.raider')
  const jobsDir = path.join(raiderDir, 'flows')
  const seen = new Map<string, Set<string>>()
  // Notifications are kept until clicked or closed, or their click handler can be collected
  const shown = new Set<NotificationHandle>()
  let handle: WatchHandle | null = null
  let watchingJobs = false
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

  const watchDir = (dir: string, recursive: boolean): boolean => {
    try {
      // In .raider/flows/ only a change the tab shows counts; a parent watch waits for the folder
      handle = deps.watch(dir, { recursive }, (filename) => {
        if (!recursive || isScheduleChange(filename)) schedule()
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

  /** Watches .raider/flows/ when it is a real folder in the project, else waits for it */
  const arm = async (): Promise<void> => {
    closeHandle()
    const raider = await lstatOrNull(raiderDir)
    if (!raider) {
      if (!stopped && watchDir(projectPath, false) && (await lstatOrNull(raiderDir))) schedule()
      return
    }
    // A link (or a file) is never followed
    if (!raider.isDirectory()) return
    const jobs = await lstatOrNull(jobsDir)
    if (!jobs) {
      if (!stopped && watchDir(raiderDir, false) && (await lstatOrNull(jobsDir))) schedule()
      return
    }
    if (!jobs.isDirectory()) return
    const [realProject, realJobs] = await Promise.all([
      fs.realpath(projectPath),
      fs.realpath(jobsDir)
    ]).catch(() => [null, null])
    if (realProject === null || realJobs !== path.join(realProject, '.raider', 'flows')) return
    if (stopped) return
    watchingJobs = watchDir(jobsDir, true)
  }

  const jobNames = async (): Promise<string[]> => {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isDirectory() && isScheduleName(e.name)).map((e) => e.name)
  }

  const notify = (name: string, line: Record<string, unknown>): void => {
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

  const focusSchedules = (): void => {
    const win = deps.mainWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (!win.webContents.isDestroyed()) win.webContents.send('focus-schedules')
  }

  const pushSchedulesChanged = (): void => {
    const win = deps.mainWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
      win.webContents.send('schedules-changed')
  }

  /**
   * Reads each schedule's log and remembers its lines; with `announce`, a line not seen before
   * that is the last attempt of a failed scheduled run is notified. Keys are only ever added (oldest dropped past
   * the cap), so a log caught mid-rewrite never makes old lines new again.
   */
  const scan = async (announce: boolean): Promise<void> => {
    // Read once per scan, and only when a new scheduled failure needs it
    let retries: Map<string, number> | null = null
    for (const name of await jobNames()) {
      // Still 4.1's folder: Task 5 moves the watcher to .raider/schedules/
      const lines = await readRunLog(projectPath, name, MAX_SCAN_BYTES, '.raider/flows')
      if (stopped) return
      const keys = seen.get(name) ?? new Set<string>()
      seen.set(name, keys)
      const failures: Record<string, unknown>[] = []
      for (const line of lines) {
        if (!isPlainObject(line)) continue
        const key = lineKey(name, line)
        if (key === null) continue
        if (keys.delete(key)) {
          keys.add(key)
          continue
        }
        keys.add(key)
        if (announce && isScheduledFailure(line)) failures.push(line)
      }
      for (const key of keys) {
        if (keys.size <= MAX_SEEN) break
        keys.delete(key)
      }
      if (failures.length === 0) continue
      retries ??= await readScheduleRetries(projectPath)
      if (stopped) return
      const jobRetries = retries.get(name) ?? 0
      for (const line of failures) if (isFinalAttempt(line, jobRetries)) notify(name, line)
    }
  }

  const settle = async (): Promise<void> => {
    if (!watchingJobs || !(await lstatOrNull(jobsDir))?.isDirectory()) await arm()
    if (stopped) return
    pushSchedulesChanged()
    await scan(true)
  }

  // Lines already in the logs when watching starts are not news
  enqueue(async () => {
    await arm()
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
