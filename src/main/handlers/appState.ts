import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'

interface AppState {
  mainWindow: BrowserWindow | null
  recorderWindow: BrowserWindow | null
  projectBaseUrl: string
  suites: Map<string, Suite>
}

export const appState: AppState = {
  mainWindow: null,
  recorderWindow: null,
  projectBaseUrl: 'https://www.google.com',
  suites: new Map()
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
