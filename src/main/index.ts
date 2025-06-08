import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import selectFolder from './handlers/selectFolder'
import readDirectory from './handlers/readDirectory'
import runRubyRaider from './handlers/runRubyRaider'
import readFile from './handlers/readFile'
import readImage from './handlers/readImage'
import openAllure from './handlers/openAllure'
import editFile from './handlers/editFile'
import runTests from './handlers/runTests'
import updateBrowserUrl from './handlers/updateBrowserUrl'
import updateBrowserType from './handlers/updateBrowserType'
import isMobileProject from './handlers/isMobileProject'
import runCommand from './handlers/runCommand'
import installRaider from './handlers/installRaider'
import updateMobileCapabilities from './handlers/updateMobileCapabilities'
import getMobileCapabilities from './handlers/getMobileCapabilities'
import isRubyInstalled from './handlers/isRubyInstalled'
// We will define the recorder handlers directly in this file to manage window state.
// So we remove the old imports for startRecording, stopRecording, etc.

const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

// --- Window and State Management ---
// Keep a reference to the main window and the recorder window
let mainWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null

// Store the URL for the recording session
let projectBaseUrl: string = 'https://www.google.com' // A sensible default

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ruby-raider')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- IPC Handlers ---

// Non-recorder handlers remain the same
ipcMain.handle('select-folder', selectFolder)
ipcMain.handle('read-directory', readDirectory)
// ... register all your other handlers here ...
ipcMain.handle('open-allure', openAllure)
ipcMain.handle('read-file', readFile)
ipcMain.handle('read-image', readImage)
ipcMain.handle('edit-file', editFile)
ipcMain.handle('run-ruby-raider', runRubyRaider)
ipcMain.handle('is-mobile-project', isMobileProject)
ipcMain.handle('run-tests', runTests)
ipcMain.handle('update-browser-url', updateBrowserUrl)
ipcMain.handle('update-browser-type', updateBrowserType)
ipcMain.handle('run-command', runCommand)
ipcMain.handle('install-raider', installRaider)
ipcMain.handle('update-mobile-capabilities', updateMobileCapabilities)
ipcMain.handle('get-mobile-capabilities', getMobileCapabilities)
ipcMain.handle('is-ruby-installed', isRubyInstalled)


// --- New Recorder IPC Handlers ---

// This handler just updates the URL state. It does not navigate.
// NOTE: Your preload calls this 'load-url-request'
ipcMain.handle('load-url-request', (event, url: string) => {
  projectBaseUrl = url
  console.log(`[MainProcess] Project base URL set to: ${projectBaseUrl}`)
  return { success: true }
})

// This handler creates and shows the new browser window for recording.
// NOTE: Your preload calls this 'start-recording-main'
ipcMain.handle('start-recording-main', (event) => {
  console.log(`[MainProcess] Start recording requested. Target URL: ${projectBaseUrl}`)

  // If the recorder window already exists, just focus it.
  if (recorderWindow) {
    recorderWindow.focus()
    return { success: true }
  }

  // Create the new recorder window
  recorderWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    title: 'Recording Session'
    // webPreferences will be needed later to inject recorder logic
  })

  // When the user closes the window, handle cleanup
  recorderWindow.on('closed', () => {
    console.log('[MainProcess] Recorder window was closed.')
    // Notify the main UI that recording has stopped
    mainWindow?.webContents.send('recording-stopped')
    recorderWindow = null
  })

  // Load the URL and focus the window.
  recorderWindow.loadURL(projectBaseUrl)
  recorderWindow.focus()

  // Notify the main UI that recording has started
  mainWindow?.webContents.send('recording-started')

  return { success: true }
})

// This handler stops the recording by closing the recorder window.
// NOTE: Your preload calls this 'stop-recording-main'
ipcMain.handle('stop-recording-main', (event) => {
  console.log('[MainProcess] Stop recording requested.')
  if (recorderWindow) {
    recorderWindow.close() // The 'closed' event handler will do the cleanup
  }
  return { success: true }
})
