import { promises as fs } from 'node:fs'
import path from 'node:path'
import { shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { listedFiles } from '../tests/projectTestIpc'
import { rubyRaiderVersion, supportsSchedules } from '../logins/rubyRaiderVersion'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { runGemCli, type GemCliResult } from '../gem/gemCli'
import { parseScheduleList, plainText } from '../gem/gemJson'
import { lastRunFromLog } from './runLog'
import { startRun } from '../run/runner'
import type { RunRequest, RunScope, StartRunResult } from '../../../shared/types/runEvents'
import { isScheduleName, scheduleArgs, validateScheduleRequest } from '../../../shared/schedules'
import type {
  GemCliError,
  GemScheduleRule,
  RunScheduleNowRequest,
  ScheduleChangeResult,
  ScheduleRequest,
  SchedulesList,
  SchedulesStatus
} from '../../../shared/types/schedules'

// The Schedules panel's channels (`raider schedule`, ruby_raider 4.2+). Only the main window
// may call them; the project is always the active one in main (never a path from the
// renderer), and the renderer sends only its rubyCommand and the payload, both checked here.
// Every gem call is gated on ruby_raider ≥ 4.2 in the project's Gemfile.lock.

export interface SchedulesIpcDeps {
  runGemCli: (
    projectPath: string,
    rubyCommand: string,
    args: string[],
    opts?: { json?: boolean }
  ) => Promise<GemCliResult>
  /** Spec files as the project's test list has them; throws for any other */
  listedFiles: (files: unknown[]) => Promise<{ projectPath: string; files: string[] }>
  /** shell.openPath: an error message, empty on success */
  openPath: (file: string) => Promise<string>
  /** The runner's startRun, refusing unless `projectPath` is still the active project */
  startRun: (request: RunRequest, projectPath: string) => Promise<StartRunResult>
  platform: NodeJS.Platform
}

const defaultDeps: SchedulesIpcDeps = {
  runGemCli: (...args) => runGemCli(...args),
  listedFiles: (files) => listedFiles(files),
  openPath: (file) => shell.openPath(file),
  startRun: (request, projectPath) => startRun(request, {}, projectPath),
  platform: process.platform
}

const MAX_MESSAGE = 500
const INVALID: GemCliError = { error: 'invalid' }
const OLD_SCHEDULES_REL = '.raider/flows/schedules.yml'
const reportRel = (name: string): string => `.raider/schedules/${name}/last/index.html`
const RESULTS_REPORT_REL = 'raider-results/index.html'

// What a 4.1 ruby_raider (no `schedule` command) prints
const NO_SCHEDULE_COMMAND = /Could not find command "schedule"/
// What bundler / ruby print when the project's bundle can't load ruby_raider at all
const GEM_CANT_LOAD = [
  /bundler: (?:failed to load command|command not found): raider/,
  /Could not find (?:gem )?['"]?ruby_raider/,
  /Could not find .+ in (?:locally installed gems|any of the sources)/,
  /Could not locate Gemfile/,
  /Bundler::GemNotFound|Gem::MissingSpecError|Gem::LoadError/,
  /cannot load such file/,
  /\bLoadError\b/,
  /Your Ruby version is .+, but your Gemfile specified/
]
// The gem's one line when it removed (or could not remove) the project's 4.1 schedules
const OLD_SCHEDULES_NOTICE = /^(?:Removed|Could not remove) .*Ruby Raider 4\.1/

const fromMainWindow = (event: IpcMainInvokeEvent): boolean =>
  event.sender.id === appState.mainWindow?.webContents.id

const invalid = (message: string): GemCliError => ({ error: 'invalid', message })

const oneLine = (text: string): string =>
  plainText(text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '')
    .trim()
    .slice(0, MAX_MESSAGE)

/** The 4.1-cleanup notice among a successful command's stderr lines, or null */
function noticeOf(stderr: string): string | null {
  const line = stderr
    .split(/\r?\n/)
    .map((text) => plainText(text).trim())
    .find((text) => OLD_SCHEDULES_NOTICE.test(text))
  return line ? line.slice(0, MAX_MESSAGE) : null
}

/**
 * A failed gem call as the renderer gets it: an old or unloadable gem as a code (its copy is
 * the renderer's), any other refusal as the gem's own one line.
 */
export function cliError(result: Extract<GemCliResult, { ok: false }>): GemCliError {
  if (result.error === 'refused') {
    const stderr = result.stderr ?? result.message ?? ''
    if (NO_SCHEDULE_COMMAND.test(stderr)) return { error: 'needs42' }
    if (GEM_CANT_LOAD.some((pattern) => pattern.test(stderr))) return { error: 'rubyCantRun' }
  }
  return result.message === undefined
    ? { error: result.error }
    : { error: result.error, message: result.message }
}

async function lockedVersion(projectPath: string): Promise<string | null> {
  const lock = await fs.readFile(path.join(projectPath, 'Gemfile.lock'), 'utf8').catch(() => '')
  return rubyRaiderVersion(lock)
}

/** The active project, once activation has settled; null without one. */
async function currentProject(): Promise<string | null> {
  await activationSettled()
  return appState.projectPath
}

/** The active project when it may run `raider schedule`, else the error to answer with. */
async function gate(
  rubyCommand: unknown
): Promise<{ projectPath: string; rubyCommand: string } | GemCliError> {
  if (!isValidRubyCommand(rubyCommand)) return invalid('Not a valid Ruby command.')
  const projectPath = await currentProject()
  if (!projectPath) return { error: 'no-project' }
  if (!supportsSchedules(await lockedVersion(projectPath))) return { error: 'needs42' }
  return { projectPath, rubyCommand }
}

/**
 * The project's schedules from `raider schedule list --json`, each with its last run: the
 * run log's last line (so a busy run shows), else the gem's `last`. For main's own callers
 * too (Run now reads the schedule here, never from the renderer); `projectPath` must come
 * from main.
 */
export async function listSchedules(
  projectPath: string,
  rubyCommand: string,
  deps: Pick<SchedulesIpcDeps, 'runGemCli'> = defaultDeps
): Promise<SchedulesList | GemCliError> {
  const result = await deps.runGemCli(projectPath, rubyCommand, ['schedule', 'list', '--json'], {
    json: true
  })
  if (!result.ok) return cliError(result)
  const list = parseScheduleList(result.json)
  if (!list) return { error: 'gem-output' }
  const schedules = await Promise.all(
    list.schedules.map(async (row) => ({
      ...row,
      last: (await lastRunFromLog(projectPath, row.name)) ?? row.last
    }))
  )
  return { notice: list.notice, schedules }
}

/** 'schedules-status': read from files only, never runs the gem. */
export async function schedulesStatusHandler(
  event: IpcMainInvokeEvent,
  deps: Pick<SchedulesIpcDeps, 'platform'> = defaultDeps
): Promise<SchedulesStatus | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const projectPath = await currentProject()
  if (!projectPath) return { error: 'no-project' }
  const version = await lockedVersion(projectPath)
  const old = await fs.lstat(path.join(projectPath, OLD_SCHEDULES_REL)).catch(() => null)
  return {
    supported: supportsSchedules(version),
    version,
    oldSchedules: old?.isFile() ?? false,
    platform: deps.platform
  }
}

/** 'list-schedules' */
export async function listSchedulesHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  deps: SchedulesIpcDeps = defaultDeps
): Promise<SchedulesList | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  return listSchedules(target.projectPath, target.rubyCommand, deps)
}

/** 'add-schedule': `raider schedule add NAME [FILE…] …`, adding or replacing NAME. */
export async function addScheduleHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  payload: unknown,
  deps: SchedulesIpcDeps = defaultDeps
): Promise<ScheduleChangeResult | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  let request: ScheduleRequest
  try {
    request = validateScheduleRequest(payload)
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'The schedule is not valid.')
  }
  if (request.showBrowser && deps.platform === 'linux')
    return invalid('Show the browser is not available on Linux.')
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  if (request.selection.kind === 'files') {
    try {
      const listed = await deps.listedFiles(request.selection.files)
      // The project may have changed while its tests were listed
      if (listed.projectPath !== target.projectPath) return { error: 'no-project' }
    } catch {
      return invalid('Choose test files from the project.')
    }
  }
  return change(target, scheduleArgs(request), deps)
}

/** 'remove-schedule': `raider schedule remove NAME` */
export async function removeScheduleHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  name: unknown,
  deps: SchedulesIpcDeps = defaultDeps
): Promise<ScheduleChangeResult | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  if (typeof name !== 'string' || !isScheduleName(name)) return invalid('Not a valid name.')
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  return change(target, ['schedule', 'remove', name], deps)
}

async function change(
  target: { projectPath: string; rubyCommand: string },
  args: string[],
  deps: SchedulesIpcDeps
): Promise<ScheduleChangeResult | GemCliError> {
  const result = await deps.runGemCli(target.projectPath, target.rubyCommand, args)
  if (!result.ok) return cliError(result)
  return { ok: true, message: oneLine(result.stdout), notice: noticeOf(result.stderr) }
}

/**
 * The file at `rel` when it is a regular file (not a link) whose real path is exactly where
 * it should be inside the real project (so no folder on the way is a link either); else null.
 */
async function realReport(projectPath: string, rel: string): Promise<string | null> {
  try {
    const file = path.join(projectPath, rel)
    if (!(await fs.lstat(file)).isFile()) return null
    const [realProject, realFile] = await Promise.all([fs.realpath(projectPath), fs.realpath(file)])
    return realFile === path.join(realProject, rel) ? realFile : null
  } catch {
    return null
  }
}

/**
 * 'open-schedule-report': the schedule's own copy of its last report
 * (.raider/schedules/<name>/last/index.html), else the project's raider-results report, in
 * the default app.
 */
export async function openScheduleReportHandler(
  event: IpcMainInvokeEvent,
  name: unknown,
  deps: Pick<SchedulesIpcDeps, 'openPath'> = defaultDeps
): Promise<{ ok: true } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  if (typeof name !== 'string' || !isScheduleName(name)) return invalid('Not a valid name.')
  const projectPath = await currentProject()
  if (!projectPath) return { error: 'no-project' }
  const report =
    (await realReport(projectPath, reportRel(name))) ??
    (await realReport(projectPath, RESULTS_REPORT_REL))
  if (!report) return { error: 'noReport' }
  const error = await deps.openPath(report)
  return error ? { error: 'open-failed', message: oneLine(error) } : { ok: true }
}

type RunNowFields = Omit<RunScheduleNowRequest, 'name'> & { name: string }

/** The allowed fields of a Run now payload; anything else (scope, headed…) is ignored. */
function runNowFields(payload: unknown): RunNowFields | string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    return 'No schedule was given.'
  const { name, workers, quarantinedFails, loginState } = payload as Record<string, unknown>
  if (typeof name !== 'string' || !isScheduleName(name)) return 'Not a valid name.'
  if (workers !== undefined && !(Number.isSafeInteger(workers) && (workers as number) >= 1))
    return 'Not a valid worker count.'
  if (quarantinedFails !== undefined && typeof quarantinedFails !== 'boolean')
    return 'Not a valid quarantine option.'
  if (loginState !== undefined && loginState !== 'off' && loginState !== 'refresh')
    return 'Not a valid login option.'
  return {
    name,
    ...(workers !== undefined ? { workers: workers as number } : {}),
    ...(quarantinedFails !== undefined ? { quarantinedFails } : {}),
    ...(loginState !== undefined ? { loginState } : {})
  }
}

const scopeOf = (selection: GemScheduleRule['selection']): RunScope =>
  selection.kind === 'all'
    ? { kind: 'all' }
    : selection.kind === 'tag'
      ? { kind: 'tags', tags: [selection.tag] }
      : { kind: 'files', files: [...selection.files] }

/**
 * 'run-schedule-now': a normal app run of the schedule's tests. The schedule (its tests and
 * Show the browser) is read here from `raider schedule list`, never taken from the renderer;
 * the renderer sends only its usual run settings. Writes no run log line.
 */
export async function runScheduleNowHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  payload: unknown,
  deps: SchedulesIpcDeps = defaultDeps
): Promise<StartRunResult | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const fields = runNowFields(payload)
  if (typeof fields === 'string') return invalid(fields)
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  const list = await listSchedules(target.projectPath, target.rubyCommand, deps)
  if ('error' in list) return list
  const row = list.schedules.find((schedule) => schedule.name === fields.name)
  if (!row) return invalid('No schedule with that name.')
  if (row.orphan) return invalid('This schedule has no rule to run.')

  const scope = scopeOf(row.selection)
  // One file runs serially, as a one-file run from the Tests list does
  const serial = scope.kind === 'files' && scope.files.length <= 1
  const request: RunRequest = {
    scope,
    ...(fields.workers !== undefined && !serial ? { workers: fields.workers } : {}),
    rubyCommand: target.rubyCommand,
    ...(fields.quarantinedFails !== undefined ? { quarantinedFails: fields.quarantinedFails } : {}),
    ...(fields.loginState !== undefined ? { loginState: fields.loginState } : {}),
    headed: deps.platform === 'linux' ? false : row.showBrowser
  }
  const result = await deps.startRun(request, target.projectPath)
  if ('runId' in result || result.error === 'busy' || result.error === 'scheduleBusy') return result
  return { error: 'refused', message: oneLine(result.error) }
}

export function registerSchedulesIpc(ipcMain: IpcMain, deps: SchedulesIpcDeps = defaultDeps): void {
  ipcMain.handle('schedules-status', (event) => schedulesStatusHandler(event, deps))
  ipcMain.handle('list-schedules', (event, rubyCommand) =>
    listSchedulesHandler(event, rubyCommand, deps)
  )
  ipcMain.handle('add-schedule', (event, rubyCommand, payload) =>
    addScheduleHandler(event, rubyCommand, payload, deps)
  )
  ipcMain.handle('remove-schedule', (event, rubyCommand, name) =>
    removeScheduleHandler(event, rubyCommand, name, deps)
  )
  ipcMain.handle('open-schedule-report', (event, name) =>
    openScheduleReportHandler(event, name, deps)
  )
  ipcMain.handle('run-schedule-now', (event, rubyCommand, payload) =>
    runScheduleNowHandler(event, rubyCommand, payload, deps)
  )
}
