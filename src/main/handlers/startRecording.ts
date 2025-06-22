import { BrowserWindow } from 'electron'
import { join } from 'path'
import { appState } from './appState'

let recorderWindow: BrowserWindow | null = null; // Need to manage this state

export default (mainWindow: BrowserWindow | null) => {
  if (recorderWindow) {
    recorderWindow.focus()
    return { success: true }
  }
  recorderWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    title: 'Recording Session',
    webPreferences: {
      preload: join(__dirname, '../../preload/recorderPreload.js')
    }
  });

  recorderWindow.on('closed', () => {
    mainWindow?.webContents.send('recording-stopped');
    recorderWindow = null;
  });

  recorderWindow.loadURL(appState.projectBaseUrl);
  recorderWindow.focus();
  mainWindow?.webContents.send('recording-started', appState.projectBaseUrl);

  return { success: true };
}
