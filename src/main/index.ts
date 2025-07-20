import { app, shell, BrowserWindow, ipcMain, IpcMainEvent, dialog } from "electron";
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { randomUUID } from 'crypto'
import fs from 'fs'
import { appState, setMainWindow, setRecorderWindow, mainWindow, recorderWindow } from './handlers/appState';

// Import all your existing individual handlers
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
import runRecording from './handlers/runRecording'
import commandParser from './handlers/commandParser'

// Import the newly separated handlers
import loadUrlRequest from './handlers/loadUrlRequest'
import startRecording from './handlers/startRecording'
import stopRecording from './handlers/stopRecording'
import getSuites from './handlers/getSuites'
import createSuite from './handlers/createSuite'
import deleteSuite from './handlers/deleteSuite'
import saveTest from './handlers/saveTest'
import runSuite from './handlers/runSuite'
import exportTest from './handlers/exportTest'
import deleteTest from './handlers/deleteTest'
import recorderEvent from './handlers/recorderEvent'


const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

let projectBaseUrl: string = 'https://www.google.com'

function createWindow(): void {
  const newMainWindow = new BrowserWindow({ // Use a temporary variable
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setMainWindow(newMainWindow); // Set the global mainWindow

  if (is.dev) {
    mainWindow!.webContents.openDevTools()
  }

  mainWindow!.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow!.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow!.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow!.loadFile(join(__dirname, '../renderer/index.html'))
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
ipcMain.handle('run-test', (event, args) => runRecording(args)); // runRecording is also now a handler
ipcMain.handle('command-parser', async (_event, command: string) => {
  const friendlyText = commandParser(command);
  return friendlyText;
});
// Newly separated handlers
ipcMain.handle('get-suites', getSuites)
ipcMain.handle('create-suite', (event, suiteName: string) => createSuite(mainWindow!, event, suiteName))
ipcMain.handle('delete-suite', (event, suiteId: string) => deleteSuite(mainWindow!, event, suiteId))
ipcMain.handle('save-test', (event, args) => saveTest(mainWindow!, event, args))
ipcMain.handle('run-suite', runSuite)
ipcMain.handle('export-test', exportTest)
ipcMain.handle('delete-test', (event, args) => deleteTest(mainWindow!, event, args))

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

  recorderWindow!.on('closed', () => {
    mainWindow?.webContents.send('recording-stopped')
    setRecorderWindow(null)
  })

  recorderWindow!.loadURL(projectBaseUrl)
  recorderWindow!.focus()

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
  console.log('[MainProcess] Received recorder event:', data);

  let commandString = '';
  switch (data.action) {
    case 'click':
      const escapedClickSelector = data.selector.replace(/"/g, '\\"');
      commandString = `@driver.find_element(:css, "${escapedClickSelector}").click # Clicked <${data.tagName.toLowerCase()}>`;
      break;

    case 'type':
      const escapedTypeSelector = data.selector.replace(/"/g, '\\"');
      const escapedValue = data.value.replace(/"/g, '\\"');
      commandString = `@driver.find_element(:css, "${escapedTypeSelector}").clear\n`;
      commandString += `    @driver.find_element(:css, "${escapedTypeSelector}").send_keys("${escapedValue}")`;
      break;

    // *** NEW CASE IS HERE ***
    case 'sendKeys':
      const keySymbol = keyMap[data.value];
      if (keySymbol) {
        const escapedKeySelector = data.selector.replace(/"/g, '\\"');
        commandString = `@driver.find_element(:css, "${escapedKeySelector}").send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`;
      }
      break;
  }

  if (commandString) {
    mainWindow?.webContents.send('new-recorded-command', commandString);
  }
});
