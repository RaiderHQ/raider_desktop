import { app, shell, BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
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

const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

// --- Window and State Management ---
let mainWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let projectBaseUrl: string = 'https://www.google.com'

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

ipcMain.handle('select-folder', selectFolder)
ipcMain.handle('read-directory', readDirectory)
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

// --- Recorder IPC Handlers ---

ipcMain.handle('load-url-request', (event, url: string) => {
  projectBaseUrl = url
  console.log(`[MainProcess] Project base URL set to: ${projectBaseUrl}`)
  return { success: true }
})

ipcMain.handle('start-recording-main', (event) => {
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
      preload: join(__dirname, '../preload/recorderPreload.js')
    }
  })

  recorderWindow.on('closed', () => {
    mainWindow?.webContents.send('recording-stopped')
    recorderWindow = null
  })

  recorderWindow.loadURL(projectBaseUrl)
  recorderWindow.focus()

  // *** CHANGE IS HERE ***
  // Notify the UI that recording has started AND send the URL that was used.
  mainWindow?.webContents.send('recording-started', projectBaseUrl)

  return { success: true }
})

ipcMain.handle('stop-recording-main', () => {
  if (recorderWindow) {
    recorderWindow.close()
  }
  return { success: true }
})

ipcMain.on('recorder-event', (event: IpcMainEvent, data: any) => {
  let commandString = ''
  switch (data.action) {
    case 'click':
      const escapedSelector = data.selector.replace(/"/g, '\\"')
      commandString = `driver.find_element(:css, "${escapedSelector}").click # Clicked <${data.tagName.toLowerCase()}>`
      break
  }

  if (commandString) {
    mainWindow?.webContents.send('new-recorded-command', commandString)
  }
})
