import { appState } from '../appState'
import { cancelPickMode } from './pickMode'

function stopRecordingMain(): { success: boolean } {
  appState.activeTraceDir = null
  // Before the guest is forgotten, so its outline and listeners are switched off too
  cancelPickMode()
  appState.recorderWebContentsId = null
  appState.recordingMode = 'test'
  appState.mainWindow?.webContents.send('recording-stopped')
  return { success: true }
}

export default stopRecordingMain
