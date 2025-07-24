import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'

interface AppState {
  mainWindow: BrowserWindow | null
  recorderWindow: BrowserWindow | null
  projectBaseUrl: string
  suites: Map<string, Suite>
  selectorPriorities: string[]
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
  projectBaseUrl: 'https://www.google.com',
  suites: new Map(),
  selectorPriorities: ['id', 'css', 'xpath']
}

export function setMainWindow(window: BrowserWindow | null): void {
  appState.mainWindow = window
}

export function setRecorderWindow(window: BrowserWindow | null): void {
  appState.recorderWindow = window
}

export function setProjectBaseUrl(url: string): void {
  appState.projectBaseUrl = url
}
