import { appState } from './appState'

function stopRecordingMain(): { success: boolean } {
  if (appState.recorderWindow) {
    appState.recorderWindow.close()
  }
  return { success: true }
}

export default stopRecordingMain
