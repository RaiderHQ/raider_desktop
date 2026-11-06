import type { BrowserWindow, IpcMain } from 'electron'
import { appState } from '../appState'

/**
 * The main window reports whether a recording is running on 'menu-recording' (one way,
 * for the Record / Stop & save menu item). Only the boolean true counts, and only the
 * main window's page may say it.
 */
export function installRecordingState(ipc: IpcMain, onChange: (recording: boolean) => void): void {
  ipc.on('menu-recording', (event: { sender?: unknown }, active: unknown) => {
    const main = appState.mainWindow
    if (!main || main.isDestroyed() || event.sender !== main.webContents) return
    onChange(active === true)
  })
}

/**
 * Whatever the page last said is stale once its window closes, crashes or navigates
 * away (its unmount effect does not run then): reset to not recording.
 */
export function resetRecordingOnWindowLoss(win: BrowserWindow, reset: () => void): void {
  win.on('closed', reset)
  win.webContents.on('render-process-gone', reset)
  win.webContents.on(
    'did-start-navigation',
    (details: { isMainFrame?: boolean; isSameDocument?: boolean }) => {
      // A reload or a new page, not a route change inside the app
      if (details.isMainFrame && !details.isSameDocument) reset()
    }
  )
}
