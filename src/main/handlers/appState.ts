import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'
import type { ChildProcess } from 'child_process'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type { SuiteIndexEntry } from './suitePersistence'
import { DEFAULT_RECORDER_SETTINGS } from './config/projectSettings'

/**
 * Where the active project keeps its suites:
 * - legacy: suites.json version 2 holds every test (Cucumber, non-recordable,
 *   or an RSpec project whose move to project files was postponed)
 * - files: recorded tests are spec files + sidecars, suites.json is a version 3 index
 * - locked: suites.json was written by a newer Raider; nothing is shown or written
 */
export type SuiteMode = 'legacy' | 'files' | 'locked'
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
  /** The suites as the renderer sees them (in files mode, assembled from the index and sidecars) */
  suites: Map<string, Suite>
  suiteMode: SuiteMode
  suiteLock: SuiteLock | null
  /** Files mode only: the version 3 index. Keeps ids whose sidecar is missing, which `suites` leaves out */
  suiteIndex: Map<string, SuiteIndexEntry>
  recorderSettings: RecorderSettings
  activeTraceDir: string | null
  activeReplayProcess: ChildProcess | null
  isReplayingInWebview: boolean
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
  suites: new Map(),
  suiteMode: 'legacy',
  suiteLock: null,
  suiteIndex: new Map(),
  recorderSettings: { ...DEFAULT_RECORDER_SETTINGS },
  activeTraceDir: null,
  activeReplayProcess: null,
  isReplayingInWebview: false
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
