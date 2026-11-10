import { promises as fs } from 'node:fs'
import path from 'node:path'
import { shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { canRecordFiles } from '../tests/recordedStore'
import { flowsReady } from '../tests/recordedTests'
import { assertRealInside, resolveInside } from '../tests/sidecar'
import { rubyRaiderVersion, supportsFlows } from '../logins/rubyRaiderVersion'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { runFlowCli, type FlowCliResult } from '../gem/gemCli'
import {
  listFlowEnvKeys,
  parseRemovePayload,
  parseSetPayload,
  removeFlowEnv,
  setFlowEnv
} from './flowEnv'
import { lastFlowResults, realResultsDir } from './flowRuns'
import { parseGemFlows, parseGemSchedules, plainText } from '../gem/gemJson'
import { flowFile, flowOfResultsDir, isFlowName } from '../../../shared/flows'
import { scheduleArgs, validateSchedule } from '../../../shared/schedules'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type {
  FlowEnvError,
  FlowEnvKeys,
  FlowLastResults,
  FlowsStatus,
  GemFlow
} from '../../../shared/types/flows'
import type { GemCliError, GemSchedule } from '../../../shared/types/schedules'

// The Flows tab's channels. Only the main window may call them; the project is always the
// active one (never a path from the renderer), and the renderer sends only its rubyCommand
// and the payload. Every gem call is gated on the project being ready for flows.

export interface FlowsIpcDeps {
  runFlowCli: (
    projectPath: string,
    rubyCommand: string,
    args: string[],
    opts?: { json?: boolean }
  ) => Promise<FlowCliResult>
}

const defaultDeps: FlowsIpcDeps = { runFlowCli: (...args) => runFlowCli(...args) }

const MAX_MESSAGE = 500
const INVALID: GemCliError = { error: 'invalid' }

const fromMainWindow = (event: IpcMainInvokeEvent): boolean =>
  event.sender.id === appState.mainWindow?.webContents.id

const invalid = (message: string): GemCliError => ({ error: 'invalid', message })

async function lockedVersion(projectPath: string): Promise<string | null> {
  const lock = await fs.readFile(path.join(projectPath, 'Gemfile.lock'), 'utf8').catch(() => '')
  return rubyRaiderVersion(lock)
}

/** Whether the project can use the Flows tab; reads files only, never runs the gem. */
async function statusOf(
  projectPath: string | null,
  layout: ProjectLayout | null
): Promise<FlowsStatus> {
  if (!projectPath || !layout) return { state: 'no-project' }
  // A ruby_raider below 4.0 also makes the layout unrecordable: that is the gem's fault
  if (layout.unsupportedReason === 'gemTooOld') return { state: 'unsupported', reason: 'gem' }
  if (layout.unsupportedReason === 'mobile' || !canRecordFiles(layout))
    return { state: 'unsupported', reason: 'project' }
  if (!supportsFlows(await lockedVersion(projectPath)))
    return { state: 'unsupported', reason: 'gem' }
  if (!(await flowsReady(projectPath))) return { state: 'needs-setup' }
  return { state: 'ready' }
}

/** The active project when it may run `raider flow`, else the error to answer with. */
async function gate(
  rubyCommand: unknown,
  allowSetup = false
): Promise<{ projectPath: string; rubyCommand: string } | GemCliError> {
  if (!isValidRubyCommand(rubyCommand)) return invalid('Not a valid Ruby command.')
  const target = await flowsProject(allowSetup)
  return 'error' in target ? target : { projectPath: target.projectPath, rubyCommand }
}

/** The active project when flows may be used (set up, or also before setup with `allowSetup`) */
async function flowsProject(
  allowSetup: boolean
): Promise<{ projectPath: string } | { error: 'no-project' | 'unsupported' }> {
  await activationSettled()
  const { projectPath, layout } = appState
  const status = await statusOf(projectPath, layout)
  if (status.state === 'no-project') return { error: 'no-project' }
  const allowed = status.state === 'ready' || (allowSetup && status.state === 'needs-setup')
  if (!allowed || !projectPath) return { error: 'unsupported' }
  return { projectPath }
}

const cliError = (result: Extract<FlowCliResult, { ok: false }>): GemCliError =>
  result.message === undefined
    ? { error: result.error }
    : { error: result.error, message: result.message }

/** 'flows-status' */
export async function flowsStatusHandler(
  event: IpcMainInvokeEvent
): Promise<FlowsStatus | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  await activationSettled()
  return statusOf(appState.projectPath, appState.layout)
}

/** 'list-flows': `raider flow list --json` */
export async function listFlowsHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  deps: FlowsIpcDeps = defaultDeps
): Promise<{ flows: GemFlow[] } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  const result = await deps.runFlowCli(target.projectPath, target.rubyCommand, ['list', '--json'], {
    json: true
  })
  if (!result.ok) return cliError(result)
  const flows = parseGemFlows(result.json)
  return flows ? { flows } : { error: 'gem-output' }
}

/** 'list-schedules': `raider flow schedules --json` */
export async function listSchedulesHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  deps: FlowsIpcDeps = defaultDeps
): Promise<{ schedules: GemSchedule[] } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  const result = await deps.runFlowCli(
    target.projectPath,
    target.rubyCommand,
    ['schedules', '--json'],
    { json: true }
  )
  if (!result.ok) return cliError(result)
  const schedules = parseGemSchedules(result.json)
  return schedules ? { schedules } : { error: 'gem-output' }
}

/** 'setup-flows': `raider flow init` (also when flows are already set up) */
export async function setupFlowsHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  deps: FlowsIpcDeps = defaultDeps
): Promise<{ ok: true } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  const target = await gate(rubyCommand, true)
  if ('error' in target) return target
  const result = await deps.runFlowCli(target.projectPath, target.rubyCommand, ['init'])
  return result.ok ? { ok: true } : cliError(result)
}

/** 'schedule-flow': `raider flow schedule NAME …` for a flow file of the project */
export async function scheduleFlowHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  name: unknown,
  schedule: unknown,
  deps: FlowsIpcDeps = defaultDeps
): Promise<{ ok: true; message: string } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  if (typeof name !== 'string' || !isFlowName(name)) return invalid('Not a valid flow name.')
  let valid
  try {
    valid = validateSchedule(schedule)
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'The schedule is not valid.')
  }
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  if (!(await isFlowFile(target.projectPath, name))) return invalid(`There is no flow ${name}.`)
  const result = await deps.runFlowCli(
    target.projectPath,
    target.rubyCommand,
    scheduleArgs(name, valid)
  )
  if (!result.ok) return cliError(result)
  return { ok: true, message: plainText(result.stdout.split('\n')[0] ?? '').slice(0, MAX_MESSAGE) }
}

/** 'unschedule-flow': `raider flow unschedule NAME` (the flow file may be gone already) */
export async function unscheduleFlowHandler(
  event: IpcMainInvokeEvent,
  rubyCommand: unknown,
  name: unknown,
  deps: FlowsIpcDeps = defaultDeps
): Promise<{ ok: true } | GemCliError> {
  if (!fromMainWindow(event)) return INVALID
  if (typeof name !== 'string' || !isFlowName(name)) return invalid('Not a valid flow name.')
  const target = await gate(rubyCommand)
  if ('error' in target) return target
  const result = await deps.runFlowCli(target.projectPath, target.rubyCommand, ['unschedule', name])
  return result.ok ? { ok: true } : cliError(result)
}

/**
 * 'open-flow-results': a flow run's HTML report (`<resultsDir>/index.html`) in the default
 * app. The folder must be that flow's own, really inside the project, and the report a
 * regular file (not a link).
 */
export async function openFlowResultsHandler(
  event: IpcMainInvokeEvent,
  name: unknown,
  resultsDir: unknown
): Promise<{ success: boolean; error?: string }> {
  if (!fromMainWindow(event)) return { success: false, error: 'invalid' }
  if (typeof name !== 'string' || !isFlowName(name)) return { success: false, error: 'invalid' }
  if (flowOfResultsDir(resultsDir, name) === null) return { success: false, error: 'invalid' }
  await activationSettled()
  const { projectPath } = appState
  if (!projectPath) return { success: false, error: 'no-project' }
  const dir = await realResultsDir(projectPath, name, resultsDir)
  if (!dir) return { success: false, error: 'not-found' }
  const report = path.join(projectPath, dir, 'index.html')
  const stat = await fs.lstat(report).catch(() => null)
  if (!stat?.isFile()) return { success: false, error: 'not-found' }
  // openPath answers with an error message (empty on success); it does not throw
  const error = await shell.openPath(report)
  return error
    ? { success: false, error: plainText(error).slice(0, MAX_MESSAGE) }
    : { success: true }
}

/** 'flow-last-results': the results folder of the flow's newest run, for its test page. */
export async function flowLastResultsHandler(
  event: IpcMainInvokeEvent,
  name: unknown
): Promise<FlowLastResults | null> {
  if (!fromMainWindow(event)) return null
  if (typeof name !== 'string' || !isFlowName(name)) return null
  await activationSettled()
  const { projectPath } = appState
  return projectPath ? lastFlowResults(projectPath, name) : null
}

const ENV_INVALID: FlowEnvError = { error: 'invalid' }

// The flow secrets file needs a ruby_raider with flows, not flows set up: the gem reads it at run time

/** 'list-flow-env-keys': the keys of .raider/flows/env (never values) */
export async function listFlowEnvKeysHandler(
  event: IpcMainInvokeEvent
): Promise<FlowEnvKeys | FlowEnvError> {
  if (!fromMainWindow(event)) return ENV_INVALID
  const target = await flowsProject(true)
  return 'error' in target ? target : listFlowEnvKeys(target.projectPath)
}

/** 'set-flow-env': adds or replaces `{ key, value }` in .raider/flows/env; answers keys only */
export async function setFlowEnvHandler(
  event: IpcMainInvokeEvent,
  payload: unknown
): Promise<FlowEnvKeys | FlowEnvError> {
  if (!fromMainWindow(event)) return ENV_INVALID
  const entry = parseSetPayload(payload)
  if (!entry) return ENV_INVALID
  const target = await flowsProject(true)
  return 'error' in target ? target : setFlowEnv(target.projectPath, entry.key, entry.value)
}

/** 'remove-flow-env': drops `{ key }` from .raider/flows/env; answers keys only */
export async function removeFlowEnvHandler(
  event: IpcMainInvokeEvent,
  payload: unknown
): Promise<FlowEnvKeys | FlowEnvError> {
  if (!fromMainWindow(event)) return ENV_INVALID
  const entry = parseRemovePayload(payload)
  if (!entry) return ENV_INVALID
  const target = await flowsProject(true)
  return 'error' in target ? target : removeFlowEnv(target.projectPath, entry.key)
}

/** True when flows/<name>_flow.rb is a regular file really inside the project. */
async function isFlowFile(projectPath: string, name: string): Promise<boolean> {
  try {
    const file = resolveInside(projectPath, flowFile(name))
    await assertRealInside(projectPath, file)
    return (await fs.stat(file)).isFile()
  } catch {
    return false
  }
}

export function registerFlowsIpc(ipcMain: IpcMain, deps: FlowsIpcDeps = defaultDeps): void {
  ipcMain.handle('flows-status', (event) => flowsStatusHandler(event))
  ipcMain.handle('list-flows', (event, rubyCommand) => listFlowsHandler(event, rubyCommand, deps))
  ipcMain.handle('list-schedules', (event, rubyCommand) =>
    listSchedulesHandler(event, rubyCommand, deps)
  )
  ipcMain.handle('setup-flows', (event, rubyCommand) => setupFlowsHandler(event, rubyCommand, deps))
  ipcMain.handle('schedule-flow', (event, rubyCommand, name, schedule) =>
    scheduleFlowHandler(event, rubyCommand, name, schedule, deps)
  )
  ipcMain.handle('unschedule-flow', (event, rubyCommand, name) =>
    unscheduleFlowHandler(event, rubyCommand, name, deps)
  )
  ipcMain.handle('open-flow-results', (event, name, resultsDir) =>
    openFlowResultsHandler(event, name, resultsDir)
  )
  ipcMain.handle('flow-last-results', (event, name) => flowLastResultsHandler(event, name))
  ipcMain.handle('list-flow-env-keys', (event) => listFlowEnvKeysHandler(event))
  ipcMain.handle('set-flow-env', (event, payload) => setFlowEnvHandler(event, payload))
  ipcMain.handle('remove-flow-env', (event, payload) => removeFlowEnvHandler(event, payload))
}
