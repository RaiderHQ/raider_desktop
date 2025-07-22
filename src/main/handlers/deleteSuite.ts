import { appState } from './appState'
import { BrowserWindow } from 'electron'

export default (mainWindow: BrowserWindow | null, _event: Electron.IpcMainEvent, suiteId: string) => {
  const success = appState.suites.delete(suiteId)
  if (success) {
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  }
  return { success }
}
