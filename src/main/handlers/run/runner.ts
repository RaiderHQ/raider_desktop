import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type {
  ActiveRun,
  RunCounts,
  RunEvent,
  RunRequest,
  RunScope,
  StartRunResult
} from '@shared/types/runEvents'
import { appState } from '../appState'
import checkBundle from '../ruby/checkBundle'
import bundleInstall from '../ruby/bundleInstall'
import { pushToLongship } from '../longship/pushToLongship'
import { listedFile } from '../tests/projectTestIpc'
import { buildShellCommand } from '../../utils/shellCommand'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { safeWarn } from '../../utils/safeLog'
import { buildRunCommand, validateTags, type Framework } from './runCommand'
import { clampWorkers, runDefaults } from './runDefaults'
import { reporterVersion, supportsLiveEvents } from './reporterVersion'
import { EventTail } from './eventTail'
import { Translator } from './translate'
import { RunSession } from './runSession'
import { OutputPrefixParser } from './outputPrefix'

export interface RunnerDeps {
  send(e: RunEvent): void
  spawnCommand(cmd: string, cwd: string, env: NodeJS.ProcessEnv): ChildProcess
  /** Each run's events go to <tempRoot>/<runId>. */
  tempRoot: string
  /** Makes sure the project's gems are installed; calls onInstalling only when some are missing. */
  ensureBundle(
    projectPath: string,
    rubyCommand: string,
    onInstalling: () => void
  ): Promise<{ ok: boolean; error?: string }>
  /** How long a cancelled run gets after SIGINT before SIGKILL. */
  graceMs: number
}

const POLL_MS = 50
const LOCATION = /^(.+):(\d+)$/

interface Active {
  runId: string
  session: RunSession
  child: ChildProcess | null
  cancelled: boolean
  /** Set once the process has closed: a cancel after that has nothing to stop. */
  exited: boolean
  done: boolean
  killTimer: NodeJS.Timeout | null
  graceMs: number
}

/** The current or last run; one per app. */
let current: Active | null = null
/** Set synchronously while a start is validating, so a second call can't slip in. */
let starting = false
let lastRunDir: string | null = null

function defaultDeps(): RunnerDeps {
  return {
    send: (e): void => {
      const win = appState.mainWindow
      if (win && !win.isDestroyed()) win.webContents.send('run-event', e)
    },
    spawnCommand: (cmd, cwd, env) =>
      spawn(cmd, { shell: true, cwd, env, detached: process.platform !== 'win32' }),
    tempRoot: path.join(app.getPath('temp'), 'raider-runs'),
    ensureBundle: async (
      projectPath,
      rubyCommand,
      onInstalling
    ): Promise<{ ok: boolean; error?: string }> => {
      if ((await checkBundle(projectPath, rubyCommand)).success) return { ok: true }
      onInstalling()
      const installed = await bundleInstall(projectPath, rubyCommand)
      return installed.success ? { ok: true } : { ok: false, error: installed.error }
    },
    graceMs: 10_000
  }
}

/** PATH without node_modules/.bin, so it can't shadow the project's Ruby tools. */
function cleanPath(): string {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter((p) => !p.includes(path.join('node_modules', '.bin')))
    .join(path.delimiter)
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const nonEmptyStrings = (value: unknown, what: string): string[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`No ${what} were given.`)
  if (!value.every((v) => typeof v === 'string')) throw new Error(`The ${what} are not valid.`)
  return value
}

/** Checks the (untrusted) request; only listed project tests and safe tags may run. */
async function validate(request: unknown): Promise<RunRequest> {
  if (typeof request !== 'object' || request === null) throw new Error('No run request was given.')
  const { scope, rubyCommand } = request as RunRequest
  if (!isValidRubyCommand(rubyCommand)) {
    throw new Error('The Ruby command is not valid, so the tests were not run.')
  }
  if (typeof scope !== 'object' || scope === null) throw new Error('No run scope was given.')
  const s = scope as RunScope
  switch (s.kind) {
    case 'all':
      break
    case 'files':
      for (const file of nonEmptyStrings(s.files, 'files')) await listedFile(file)
      break
    case 'locations':
      for (const location of nonEmptyStrings(s.locations, 'locations')) {
        const match = LOCATION.exec(location)
        if (!match) throw new Error(`Not a test location: ${location}`)
        await listedFile(match[1])
      }
      break
    case 'tags':
      validateTags(nonEmptyStrings(s.tags, 'tags'))
      break
    default:
      throw new Error('Unknown run scope.')
  }
  return request as RunRequest
}

async function detectFramework(projectPath: string): Promise<Framework> {
  try {
    return (await fs.stat(path.join(projectPath, 'spec'))).isDirectory() ? 'rspec' : 'cucumber'
  } catch {
    return 'cucumber'
  }
}

type ResultFile = { shard: boolean; finished: number; statuses: unknown[] }

/**
 * Degraded-mode counts from raider-results: run.json, or the run-<n>.json shards when
 * they are newer, keeping only files that finished after `since`.
 */
async function resultCounts(projectPath: string, since: number): Promise<RunCounts | undefined> {
  const dir = path.join(projectPath, 'raider-results')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return undefined
  }
  const files: ResultFile[] = []
  for (const name of names) {
    const shard = /^run-\d+\.json$/.test(name)
    if (!shard && name !== 'run.json') continue
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
      const finished = Date.parse(data?.run?.finished_at)
      if (!(finished >= since)) continue
      const results: unknown[] = Array.isArray(data?.results) ? data.results : []
      files.push({
        shard,
        finished,
        statuses: results.map((r) => (r as { status?: unknown })?.status)
      })
    } catch {
      // unreadable or partial file: not counted
    }
  }
  const single = files.find((f) => !f.shard)
  const shards = files.filter((f) => f.shard)
  const newestShard = Math.max(-Infinity, ...shards.map((f) => f.finished))
  const chosen = single && newestShard <= single.finished ? [single] : shards
  if (chosen.length === 0) return undefined

  const counts: RunCounts = {
    total: 0,
    passed: 0,
    failed: 0,
    quarantined: 0,
    pending: 0,
    skipped: 0
  }
  for (const status of chosen.flatMap((f) => f.statuses)) {
    counts.total += 1
    if (
      status === 'passed' ||
      status === 'failed' ||
      status === 'quarantined' ||
      status === 'pending'
    ) {
      counts[status] += 1
    } else counts.skipped += 1
  }
  return counts
}

/**
 * Starts a live run of the active project's tests. Resolves with the runId once
 * `run:started` is sent; the bundle check, spawn and events continue in the background.
 */
export async function startRun(
  request: RunRequest,
  overrides: Partial<RunnerDeps> = {}
): Promise<StartRunResult> {
  if (starting || (current && !current.done)) return { error: 'busy' }
  starting = true
  try {
    const projectPath = appState.projectPath
    if (!projectPath) throw new Error('No project is open.')
    const valid = await validate(request)
    // listedFile checked against the project open now; run only if it's still the same one
    if (appState.projectPath !== projectPath)
      throw new Error('The project changed, so the tests were not run.')
    const framework = await detectFramework(projectPath)
    const { command, workers } = buildRunCommand({
      framework,
      scope: valid.scope,
      workers: clampWorkers(valid.workers, runDefaults().maxWorkers),
      rubyCommand: valid.rubyCommand
    })
    const lock = await fs.readFile(path.join(projectPath, 'Gemfile.lock'), 'utf8').catch(() => '')
    const liveEvents = supportsLiveEvents(reporterVersion(lock))

    const deps = { ...defaultDeps(), ...overrides }
    if (lastRunDir) await fs.rm(lastRunDir, { recursive: true, force: true }).catch(() => {})
    lastRunDir = null

    const runId = randomUUID()
    const session = new RunSession({
      runId,
      request: valid,
      projectPath,
      framework,
      workers,
      liveEvents,
      emit: (e): void => {
        try {
          deps.send(e)
        } catch (error) {
          safeWarn('Could not send a run event:', message(error))
        }
      }
    })
    const active: Active = {
      runId,
      session,
      child: null,
      cancelled: false,
      exited: false,
      done: false,
      killTimer: null,
      graceMs: deps.graceMs
    }
    current = active
    session.start()
    void launch(active, deps, {
      projectPath,
      command,
      workers,
      liveEvents,
      rubyCommand: valid.rubyCommand
    })
    return { runId }
  } catch (error) {
    return { error: message(error) }
  } finally {
    starting = false
  }
}

async function launch(
  active: Active,
  deps: RunnerDeps,
  run: {
    projectPath: string
    command: string
    workers: number
    liveEvents: boolean
    rubyCommand: string
  }
): Promise<void> {
  const { session, runId } = active
  const startedAt = Date.now()
  const finishEarly = (exitCode: number | null): void => {
    clearKillTimer(active)
    try {
      session.finish(exitCode)
    } finally {
      active.done = true
    }
  }

  try {
    const bundle = await deps.ensureBundle(run.projectPath, run.rubyCommand, () =>
      session.phase('installing')
    )
    if (active.cancelled) return finishEarly(null)
    if (!bundle.ok) {
      session.output('stderr', `Failed to install gems: ${bundle.error ?? 'unknown error'}\n`)
      return finishEarly(null)
    }

    const dir = path.join(deps.tempRoot, runId)
    lastRunDir = dir
    await fs.mkdir(dir, { recursive: true })
    if (active.cancelled) return finishEarly(null)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: cleanPath(),
      RUBYOPT: [process.env.RUBYOPT, '-EUTF-8'].filter(Boolean).join(' '),
      RAIDER_EVENTS_DIR: dir
    }
    const child = deps.spawnCommand(
      buildShellCommand(run.projectPath, run.command),
      run.projectPath,
      env
    )
    active.child = child
    session.phase('booting')

    let warned = false
    const onBadLine = (): void => {
      if (warned) return
      warned = true
      safeWarn(`Run ${runId}: skipped malformed or unsupported reporter event lines.`)
    }
    const parallel = run.workers > 1
    const translator = new Translator(runId, parallel, onBadLine)
    const tail = new EventTail(
      dir,
      (worker, line) => session.apply(translator.translate(worker, line)),
      onBadLine
    )

    // Only a parallel run's output carries "[TEST GROUP n]" prefixes
    const parsers = parallel
      ? { stdout: new OutputPrefixParser(), stderr: new OutputPrefixParser() }
      : null
    const onOutput = (stream: 'stdout' | 'stderr', chunk: string): void => {
      if (!parsers) return session.output(stream, chunk)
      for (const { worker, text } of parsers[stream].push(chunk))
        session.output(stream, text, worker)
    }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => onOutput('stdout', chunk))
    child.stderr?.on('data', (chunk: string) => onOutput('stderr', chunk))

    const timer = setInterval(() => {
      void tail.poll()
      session.flushOutput()
    }, POLL_MS)

    let closing = false
    const close = async (exitCode: number | null): Promise<void> => {
      active.exited = true
      if (closing) return
      closing = true
      clearInterval(timer)
      clearKillTimer(active)
      let fallback: RunCounts | undefined
      try {
        await tail.poll()
        if (parsers) {
          for (const stream of ['stdout', 'stderr'] as const) {
            for (const { worker, text } of parsers[stream].flush())
              session.output(stream, text, worker)
          }
        }
        // run.json finished_at may have only second precision, so compare from the start's second
        if (!run.liveEvents) {
          fallback = await resultCounts(run.projectPath, Math.floor(startedAt / 1000) * 1000)
        }
      } catch (error) {
        session.output('stderr', `${message(error)}\n`)
      } finally {
        // Always finish and free the slot, whatever failed above
        try {
          session.finish(exitCode, fallback)
        } finally {
          active.done = true
        }
      }

      const events = session.snapshot().events
      const finished = events[events.length - 1]
      const status = finished?.type === 'run:finished' ? finished.status : 'errored'
      const stdout = events
        .map((e) => (e.type === 'run:output' && e.stream === 'stdout' ? e.chunk : ''))
        .join('')
      void pushToLongship(
        status === 'passed' || status === 'failed',
        stdout,
        Date.now() - startedAt
      )
    }

    child.on('error', (error) => {
      session.output('stderr', `${error.message}\n`)
      // Never started: 'close' may not follow
      if (child.pid === undefined) void close(null)
    })
    child.on('close', (code) => void close(code))
  } catch (error) {
    session.output('stderr', `${message(error)}\n`)
    finishEarly(null)
  }
}

function clearKillTimer(active: Active): void {
  if (active.killTimer) clearTimeout(active.killTimer)
  active.killTimer = null
}

function kill(child: ChildProcess, signal: 'SIGINT' | 'SIGKILL'): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    // No graceful stop on Windows: kill the whole tree at once
    spawn('taskkill', ['/pid', String(pid), '/T', '/F']).on('error', () => {})
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // already gone
    }
  }
}

/** SIGINT to the run's process group, then SIGKILL after the grace period. */
export async function cancelRun(runId: string): Promise<void> {
  const active = current
  if (!active || active.runId !== runId || active.done || active.exited || active.cancelled) return
  active.cancelled = true
  active.session.requestCancel()
  const child = active.child
  if (!child) return // not spawned yet; launch finishes the run as cancelled
  kill(child, 'SIGINT')
  if (process.platform !== 'win32') {
    active.killTimer = setTimeout(() => {
      active.killTimer = null
      // The group is gone once closed, and its pid may have been reused
      if (!active.exited) kill(child, 'SIGKILL')
    }, active.graceMs)
  }
}

/**
 * Kills the running test process group at once (app quit), so ruby, parallel workers
 * and browsers don't outlive the app. Synchronous; does nothing when no child is alive.
 */
export function killActiveRun(): void {
  const active = current
  const pid = active?.child?.pid
  if (!active || active.done || active.exited || pid === undefined) return
  clearKillTimer(active)
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
    return
  }
  kill(active.child!, 'SIGKILL')
}

/** The current or last run with its events, for a renderer that reloads. */
export function getActiveRun(): ActiveRun | null {
  return current ? current.session.snapshot() : null
}
