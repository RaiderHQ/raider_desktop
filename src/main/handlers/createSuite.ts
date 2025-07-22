import { randomUUID } from 'crypto'
import { appState } from './appState'
import { BrowserWindow } from 'electron'
import type { Suite } from '@foundation/Types/suite'

export default (mainWindow: BrowserWindow | null, _event: Electron.IpcMainEvent, suiteName: string) => {
  if (!suiteName || Array.from(appState.suites.values()).some(s => s.name === suiteName)) {
    return { success: false, error: 'A suite with this name already exists.' }
  }
  const newSuite: Suite = { id: randomUUID(), name: suiteName, tests: [] }
  appState.suites.set(newSuite.id, newSuite)
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  return { success: true, suite: newSuite }
}
