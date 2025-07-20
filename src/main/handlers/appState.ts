import { BrowserWindow } from 'electron'

export interface Test {
  id: string
  name: string
  url: string
  steps: string[]
}
export interface Suite {
  id: string
  name: string
  tests: Test[]
}

interface AppState {
  suites: Map<string, Suite>
  projectBaseUrl: string
}

export const appState: AppState = {
  suites: new Map<string, Suite>(),
  projectBaseUrl: 'https://www.google.com'
}

export let mainWindow: BrowserWindow | null = null
export let recorderWindow: BrowserWindow | null = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function setRecorderWindow(window: BrowserWindow | null) {
  recorderWindow = window
}
