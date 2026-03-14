import { appState } from '../appState'

function stopRecordingMain(): { success: boolean } {
  appState.activeTraceDir = null
  appState.recorderWebContentsId = null
  appState.mainWindow?.webContents.send('recording-stopped')
  return { success: true }
}

export default stopRecordingMain
