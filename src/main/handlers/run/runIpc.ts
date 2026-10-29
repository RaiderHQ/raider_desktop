import type { IpcMain } from 'electron'
import type { RunRequest } from '@shared/types/runEvents'
import { cancelRun, getActiveRun, startRun } from './runner'
import { runDefaults } from './runDefaults'

/** Live-run channels; events are pushed on 'run-event'. */
export function registerRunIpc(ipcMain: IpcMain): void {
  ipcMain.handle('start-run', (_event, request: RunRequest) => startRun(request))
  ipcMain.handle('cancel-run', (_event, runId: string) => cancelRun(runId))
  ipcMain.handle('get-active-run', () => getActiveRun())
  ipcMain.handle('get-run-defaults', () => runDefaults())
}
