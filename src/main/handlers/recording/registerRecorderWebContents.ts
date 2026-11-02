import { appState } from '../appState'
import { cancelPickMode } from './pickMode'

function registerRecorderWebContents(webContentsId: number): void {
  // Picking belongs to the old guest; end it there before the new one takes over
  if (webContentsId !== appState.recorderWebContentsId) cancelPickMode()
  appState.recorderWebContentsId = webContentsId
}

export default registerRecorderWebContents
