import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'

interface AppState {
  mainWindow: BrowserWindow | null
  recorderWindow: BrowserWindow | null
  recorderWebContentsId: number | null
  projectBaseUrl: string
  projectPath: string | null
  projectAutomation: string | null
  projectFramework: string | null
  rubyVersion: string | null
  suites: Map<string, Suite>
  recordingSettings: RecordingSettings
  activeTraceDir: string | null
}

interface RecordingSettings {
  implicitWait: number
  explicitWait: number
}

let recordingSettings: RecordingSettings = {
  implicitWait: 0,
  explicitWait: 30
}

/**
 * Updates the global recording settings.
 * @param newSettings - The new settings object.
 */
export function setRecordingSettings(newSettings: RecordingSettings): void {
  recordingSettings = newSettings
}

/**
 * Retrieves the current recording settings.
 * @returns The current recording settings.
 */
export function getRecordingSettings(): RecordingSettings {
  return recordingSettings
}

export const appState: AppState = {
  mainWindow: null,
  recorderWindow: null,
  recorderWebContentsId: null,
  projectBaseUrl: 'https://raider-test-site.onrender.com/',
  projectPath: null,
  projectAutomation: null,
  projectFramework: null,
  rubyVersion: null,
  suites: new Map(),
  recordingSettings: {
    implicitWait: 0,
    explicitWait: 30
  },
  activeTraceDir: null
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

export function setProjectBaseUrl(url: string): void {
  appState.projectBaseUrl = url
}
