import type { IpcMain } from 'electron'

/**
 * The page reports whether it is recording on 'recording-state'. Only the boolean
 * true counts; anything else means not recording.
 */
export function installRecordingState(ipc: IpcMain, onChange: (recording: boolean) => void): void {
  ipc.on('recording-state', (_event: unknown, active: unknown) => onChange(active === true))
}
