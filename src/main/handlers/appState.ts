import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'
import type { ChildProcess } from 'child_process'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import { DEFAULT_RECORDER_SETTINGS } from './config/projectSettings'

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
  suites: Map<string, Suite>
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
