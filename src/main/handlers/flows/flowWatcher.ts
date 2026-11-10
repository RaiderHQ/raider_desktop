import { watch as fsWatch, promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { Notification } from 'electron'
import { appState } from '../appState'
import { readRunLog } from './flowRuns'
import { isFlowName, isPlainObject } from '../../../shared/flows'

// Scheduled runs (launchd) append to .raider/flows/<name>/runs.jsonl while the app is open.
// The open project's .raider/flows/ is watched: each settled change refreshes the Flows tab
// and a new scheduled run that failed shows a notification. The log is written by project
// code, so only the folder's flow name and plain integers ever reach the notification.

/** Shown by the notification for a scheduled flow run that failed */
export const FLOW_FAILED_TITLE = 'Flow failed'
const failedAtStep = (name: string, step: number): string => `${name} failed at step ${step}`
const failedAtLine = (name: string, line: number): string => `${name} failed at line ${line}`
const couldNotStart = (name: string): string => `${name} could not start`
const failed = (name: string): string => `${name} failed`

const DEBOUNCE_MS = 300
/** Only the log's tail is read for new runs */
const MAX_SCAN_BYTES = 256 * 1024
/** Keys kept per flow; the gem keeps 50 lines, so this only bounds a hostile log */
const MAX_SEEN = 500
const RUN_ID = /^[0-9a-f]{16}$/
const NOTIFY_STATUSES = ['failed', 'setup_error']

export interface WatchHandle {
  close(): void
  on(event: 'error', listener: (error: Error) => void): unknown
}
export interface NotificationHandle {
  on(event: 'click' | 'close', listener: () => void): unknown
  show(): void
}
export interface WindowHandle {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  webContents: { isDestroyed(): boolean; send(channel: string): void }
}
export interface FlowWatcherDeps {
  watch: (dir: string, options: { recursive: boolean }, listener: () => void) => WatchHandle
  notifications: {
    isSupported(): boolean
    create(options: { title: string; body: string }): NotificationHandle
  }
  mainWindow: () => WindowHandle | null
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
}

export interface FlowWatcher {
  readonly projectPath: string
  stop(): void
  /** Resolves once the work queued so far (arming, scans) is done */
  idle(): Promise<void>
}

const isPositiveInt = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

/** The notification text for a run line of the flow `name` (a valid flow name). */
export function flowFailedBody(name: string, line: Record<string, unknown>): string {
  const step = isPlainObject(line.failed_step) ? line.failed_step : {}
  if (isPositiveInt(step.number)) return failedAtStep(name, step.number)
  if (isPositiveInt(step.line)) return failedAtLine(name, step.line)
  return line.status === 'setup_error' ? couldNotStart(name) : failed(name)
}

/** What makes a run line unique: its run id, else its start time within the flow */
function lineKey(name: string, line: Record<string, unknown>): string | null {
  if (typeof line.run_id === 'string' && RUN_ID.test(line.run_id)) return line.run_id
  if (typeof line.started_at === 'string') return `${name}\n${line.started_at}`
  return null
}

const shouldNotify = (line: Record<string, unknown>): boolean =>
  line.trigger === 'schedule' &&
  typeof line.status === 'string' &&
  NOTIFY_STATUSES.includes(line.status)

const lstatOrNull = (file: string): Promise<Stats | null> => fs.lstat(file).catch(() => null)

export function createFlowWatcher(projectPath: string, deps: FlowWatcherDeps): FlowWatcher {
  const raiderDir = path.join(projectPath, '.raider')
  const flowsDir = path.join(raiderDir, 'flows')
  const seen = new Map<string, Set<string>>()
  // Notifications are kept until clicked or closed, or their click handler can be collected
  const shown = new Set<NotificationHandle>()
  let handle: WatchHandle | null = null
  let watchingFlows = false
  let timer: unknown = null
  let stopped = false
  let queue: Promise<void> = Promise.resolve()

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(() => (stopped ? undefined : work())).catch(() => undefined)
  }

  const closeHandle = (): void => {
    handle?.close()
    handle = null
    watchingFlows = false
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
      handle = deps.watch(dir, { recursive }, schedule)
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
    const flows = await lstatOrNull(flowsDir)
    if (!flows) {
      if (!stopped && watchDir(raiderDir, false) && (await lstatOrNull(flowsDir))) schedule()
      return
    }
    if (!flows.isDirectory()) return
    const [realProject, realFlows] = await Promise.all([
      fs.realpath(projectPath),
      fs.realpath(flowsDir)
    ]).catch(() => [null, null])
    if (realProject === null || realFlows !== path.join(realProject, '.raider', 'flows')) return
    if (stopped) return
    watchingFlows = watchDir(flowsDir, true)
  }

  const flowNames = async (): Promise<string[]> => {
    const entries = await fs.readdir(flowsDir, { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isDirectory() && isFlowName(e.name)).map((e) => e.name)
  }

  const notify = (name: string, line: Record<string, unknown>): void => {
    if (!deps.notifications.isSupported()) return
    const notification = deps.notifications.create({
      title: FLOW_FAILED_TITLE,
      body: flowFailedBody(name, line)
    })
    shown.add(notification)
    notification.on('click', () => {
      shown.delete(notification)
      focusFlowsTab()
    })
    notification.on('close', () => shown.delete(notification))
    notification.show()
  }

  const focusFlowsTab = (): void => {
    const win = deps.mainWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (!win.webContents.isDestroyed()) win.webContents.send('focus-flows-tab')
  }

  const pushFlowsChanged = (): void => {
    const win = deps.mainWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
      win.webContents.send('flows-changed')
  }

  /**
   * Reads each flow's log and remembers its lines; with `announce`, a line not seen before
   * that is a failed scheduled run is notified. Keys are only ever added (oldest dropped past
   * the cap), so a log caught mid-rewrite never makes old lines new again.
   */
  const scan = async (announce: boolean): Promise<void> => {
    for (const name of await flowNames()) {
      const lines = await readRunLog(projectPath, name, MAX_SCAN_BYTES)
      if (stopped) return
      const keys = seen.get(name) ?? new Set<string>()
      seen.set(name, keys)
      for (const line of lines) {
        if (!isPlainObject(line)) continue
        const key = lineKey(name, line)
        if (key === null) continue
        if (keys.delete(key)) {
          keys.add(key)
          continue
        }
        keys.add(key)
        if (announce && shouldNotify(line)) notify(name, line)
      }
      for (const key of keys) {
        if (keys.size <= MAX_SEEN) break
        keys.delete(key)
      }
    }
  }

  const settle = async (): Promise<void> => {
    if (!watchingFlows || !(await lstatOrNull(flowsDir))?.isDirectory()) await arm()
    if (stopped) return
    pushFlowsChanged()
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
    },
    idle: (): Promise<void> => queue
  }
}

const defaultDeps = (): FlowWatcherDeps => ({
  watch: (dir, options, listener) => fsWatch(dir, options, listener),
  notifications: {
    isSupported: () => Notification.isSupported(),
    create: (options) => new Notification(options)
  },
  mainWindow: () => appState.mainWindow,
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
})

let current: FlowWatcher | null = null

/** Watches the flows of the open project; a different project's watcher is closed first. */
export function startFlowWatcher(projectPath: string, deps: FlowWatcherDeps = defaultDeps()): void {
  if (current?.projectPath === projectPath) return
  stopFlowWatcher()
  current = createFlowWatcher(projectPath, deps)
}

export function stopFlowWatcher(): void {
  current?.stop()
  current = null
}
