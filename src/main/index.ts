import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setMainWindow, appState, getRecordingSettings } from './handlers/appState'
import type { Test } from '@foundation/Types/test'
import type { TestData } from '@foundation/Types/testData'
import selectFolder from './handlers/selectFolder'
import readDirectory from './handlers/readDirectory'
import runRubyRaider from './handlers/runRubyRaider'
import readFile from './handlers/readFile'
import readImage from './handlers/readImage'
import openAllure from './handlers/openAllure'
import editFile from './handlers/editFile'
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
import getSuites from './handlers/getSuites'
import createSuite from './handlers/createSuite'
import deleteSuite from './handlers/deleteSuite'
import runSuite from './handlers/runSuite'
import exportTest from './handlers/exportTest'
import deleteTest from './handlers/deleteTest'
import recorderEvent from './handlers/recorderEvent'
import loadUrlRequest from './handlers/loadUrlRequest'
import startRecordingMain from './handlers/startRecordingMain'
import stopRecordingMain from './handlers/stopRecordingMain'
import saveRecording from './handlers/saveRecording'
import updateRecordingSettings from './handlers/updateRecordingSettings'

const iconPath = join(
  __dirname,
  process.platform === 'darwin'
    ? '../../resources/ruby-raider.icns' // macOS
    : process.platform === 'win32'
      ? '../../resources/ruby-raider.ico' // Windows
      : '../../resources/ruby-raider.png' // Linux
)

function createWindow(): void {
  const newMainWindow = new BrowserWindow({
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

  // Set the main window instance in our app state module
  setMainWindow(newMainWindow)

  if (is.dev && appState.mainWindow) {
    appState.mainWindow.webContents.openDevTools()
  }

  appState.mainWindow!.on('ready-to-show', () => {
    appState.mainWindow!.show()
  })

  appState.mainWindow!.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    appState.mainWindow!.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    appState.mainWindow!.loadFile(join(__dirname, '../renderer/index.html'))
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

  // --- All IPC Handlers Registered After Window Creation ---
  ipcMain.handle('select-folder', selectFolder)
  ipcMain.handle('read-directory', readDirectory)
  ipcMain.handle('open-allure', openAllure)
  ipcMain.handle('read-file', readFile)
  ipcMain.handle('read-image', readImage)
  ipcMain.handle('edit-file', editFile)
  ipcMain.handle('run-ruby-raider', runRubyRaider)
  ipcMain.handle('is-mobile-project', isMobileProject)
  ipcMain.handle('update-browser-url', updateBrowserUrl)
  ipcMain.handle('update-browser-type', updateBrowserType)
  ipcMain.handle('run-command', runCommand)
  ipcMain.handle('install-raider', installRaider)
  ipcMain.handle('update-mobile-capabilities', updateMobileCapabilities)
  ipcMain.handle('get-mobile-capabilities', getMobileCapabilities)
  ipcMain.handle('is-ruby-installed', isRubyInstalled)
  ipcMain.handle('command-parser', (_event, command: string) => commandParser(command))
  ipcMain.handle('get-suites', getSuites)
  ipcMain.handle('create-suite', (_event, suiteName: string) =>
    createSuite(appState.mainWindow!, suiteName)
  )
  ipcMain.handle('delete-suite', (_event, suiteId: string) =>
    deleteSuite(appState.mainWindow!, suiteId)
  )
  ipcMain.handle('run-test', (_event, suiteId: string, testId: string) => {
    const suite = appState.suites.get(suiteId)
    const test = suite?.tests.find((t) => t.id === testId)

    if (!test) {
      return { success: false, output: `Test with ID ${testId} not found.` }
    }

    const { implicitWait } = getRecordingSettings()
    return runRecording({ savedTest: test, implicitWait })
  })
  ipcMain.handle('update-recording-settings', async (_event, settings: { implicitWait: number }) => {
    try {
      return updateRecordingSettings(settings)
    } catch (error) {
      console.error('Failed to update recording settings:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('run-suite', (_event, suiteId: string) => runSuite(suiteId))
  ipcMain.handle('export-test', (_event, testData: TestData) => exportTest(testData))
  ipcMain.handle('delete-test', (_event, args) => deleteTest(appState.mainWindow!, args))
  ipcMain.handle('load-url-request', (_event, url: string) => loadUrlRequest(url))
  ipcMain.handle('start-recording-main', startRecordingMain)
  ipcMain.handle('stop-recording-main', stopRecordingMain)

  ipcMain.on('recorder-event', (_event, data: any) => recorderEvent(data))

  ipcMain.handle('save-recording', (_event, suiteId: string, test: Test) =>
    saveRecording(appState.mainWindow, suiteId, test)
  )

  // --- Assertion Context Menu Handler ---
  ipcMain.on('show-assertion-context-menu', (_event, { selector, elementText }) => {
    if (!appState.mainWindow) return

    const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
      {
        label: 'Raider Assertions',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Assert element is present',
        click: () => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'present',
            selector
          })
        }
      },
      {
        label: 'Assert element is visible',
        click: () => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'visible',
            selector
          })
        }
      },
      {
        label: 'Assert element contains text',
        click: () => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'text',
            selector,
            text: elementText.trim()
          })
        }
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: appState.mainWindow })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
