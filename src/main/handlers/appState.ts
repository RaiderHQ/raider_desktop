import { BrowserWindow } from 'electron'
import type { Test } from '@foundation/Types/test'
import type { ChildProcess } from 'child_process'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import { DEFAULT_RECORDER_SETTINGS } from './config/projectSettings'

/**
 * Whether the active project's recorded tests can change:
 * - files: recorded tests are spec files + sidecars
 * - locked: nothing is shown or written (suites.json written by a newer Raider, or a project
 *   that can't record). A version 2 suites.json that was not moved to files yet is not read
 *   either, until the migration of PR C gives its tests a home.
 */
export type SuiteMode = 'files' | 'locked'
/** Why a project is locked: a newer suites file, or recorded files in a project that can't record */
export type SuiteLock = 'tooNew' | 'cannotRecord'

interface AppState {
  mainWindow: BrowserWindow | null
  recorderWindow: BrowserWindow | null
  recorderWebContentsId: number | null
  sessionUrl: string | null
  projectPath: string | null
  projectAutomation: string | null
  projectFramework: string | null
  layout: ProjectLayout | null
  rubyVersion: string | null
  /** The recorded tests as the renderer sees them, by id (read from the sidecars) */
  tests: Map<string, Test>
  suiteMode: SuiteMode
  suiteLock: SuiteLock | null
  recorderSettings: RecorderSettings
  activeTraceDir: string | null
  activeReplayProcess: ChildProcess | null
  isReplayingInWebview: boolean
  /** Picking one element in the recorder: no steps are recorded, the next click is the pick */
  pickMode: boolean
  /** When pick mode last ended (ms); clicks just after it are the rest of the pick, not steps */
  pickModeEndedAt: number
  /** What the pick in progress is for: a new element for a step, or an element to check */
  pickPurpose: 'repick' | 'assert'
  /** The page reported a recording in progress (drives the Record / Stop & save menu item) */
  recording: boolean
}

export const appState: AppState = {
  mainWindow: null,
  recorderWindow: null,
  recorderWebContentsId: null,
  sessionUrl: null,
  projectPath: null,
  projectAutomation: null,
  projectFramework: null,
  layout: null,
  rubyVersion: null,
  tests: new Map(),
  suiteMode: 'files',
  suiteLock: null,
  recorderSettings: { ...DEFAULT_RECORDER_SETTINGS },
  activeTraceDir: null,
  activeReplayProcess: null,
  isReplayingInWebview: false,
  pickMode: false,
  pickModeEndedAt: 0,
  pickPurpose: 'repick',
  recording: false
}

export function setProjectAutomation(automation: string | null): void {
  appState.projectAutomation = automation
}

export function setProjectFramework(framework: string | null): void {
  appState.projectFramework = framework
}

export function setMainWindow(window: BrowserWindow | null): void {
  appState.mainWindow = window
}

export function setRecorderWindow(window: BrowserWindow | null): void {
  appState.recorderWindow = window
}

export function setRubyVersion(version: string | null): void {
  appState.rubyVersion = version
}
