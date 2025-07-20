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
ipcMain.handle('load-url-request', loadUrlRequest)
ipcMain.handle('start-recording-main', () => startRecording(mainWindow!)) // Pass mainWindow
ipcMain.handle('stop-recording-main', stopRecording)
ipcMain.handle('get-suites', getSuites)
ipcMain.handle('create-suite', (event, suiteName: string) => createSuite(mainWindow!, event, suiteName))
ipcMain.handle('delete-suite', (event, suiteId: string) => deleteSuite(mainWindow!, event, suiteId))
ipcMain.handle('save-test', (event, args) => saveTest(mainWindow!, event, args))
ipcMain.handle('run-suite', runSuite)
ipcMain.handle('export-test', exportTest)
ipcMain.handle('delete-test', (event, args) => deleteTest(mainWindow!, event, args))
ipcMain.on('recorder-event', (event: IpcMainEvent, data: any) => recorderEvent(mainWindow!, event, data));
