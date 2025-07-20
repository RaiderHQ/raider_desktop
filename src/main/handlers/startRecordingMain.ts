import { BrowserWindow } from 'electron'
import { join } from 'path'
import { appState, setRecorderWindow} from './appState'

function startRecordingMain(): { success: boolean } {
  if (appState.recorderWindow) {
    appState.recorderWindow.focus()
    return { success: true }
  }

  const newRecorderWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    title: 'Recording Session',
    webPreferences: {
      preload: join(__dirname, '../preload/recorderPreload.js')
    }
  })

  setRecorderWindow(newRecorderWindow)

  appState.recorderWindow!.on('closed', () => {
    appState.mainWindow?.webContents.send('recording-stopped')
    setRecorderWindow(null)
  })

  appState.recorderWindow!.loadURL(appState.projectBaseUrl)
  appState.recorderWindow!.focus()

  appState.mainWindow?.webContents.send('recording-started', appState.projectBaseUrl)

  return { success: true }
}

export default startRecordingMain
