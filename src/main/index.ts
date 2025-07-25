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
import isRbenvRubyInstalled from './handlers/isRbenvRubyInstalled'
import isRvmRubyInstalled from './handlers/isRvmRubyInstalled'
import isSystemRubyInstalled from './handlers/isSystemRubyInstalled'
import installRbenvAndRuby from './handlers/installRbenvAndRuby'
import installGems from './handlers/installGems'
import runRecording from './handlers/runRecording'
import commandParser from './handlers/commandParser'
import getSuites from './handlers/getSuites'
import createSuite from './handlers/createSuite'
import deleteSuite from './handlers/deleteSuite'
import runSuite from './handlers/runSuite'
import exportTest from './handlers/exportTest'
import exportSuite from './handlers/exportSuite'
import exportProject from './handlers/exportProject'
import importProject from './handlers/importProject'
import importSuite from './handlers/importSuite'
import importTest from './handlers/importTest'
import deleteTest from './handlers/deleteTest'
import recorderEvent, { RecorderEventData } from './handlers/recorderEvent'
import loadUrlRequest from './handlers/loadUrlRequest'
import startRecordingMain from './handlers/startRecordingMain'
import stopRecordingMain from './handlers/stopRecordingMain'
import saveRecording from './handlers/saveRecording'
import updateRecordingSettings from './handlers/updateRecordingSettings'
import getSelectorPriorities from './handlers/getSelectorPriorities'
import saveSelectorPriorities from './handlers/saveSelectorPriorities'

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
  ipcMain.handle('is-rbenv-ruby-installed', isRbenvRubyInstalled)
  ipcMain.handle('is-rvm-ruby-installed', isRvmRubyInstalled)
  ipcMain.handle('is-system-ruby-installed', isSystemRubyInstalled)
  ipcMain.handle('install-rbenv-and-ruby', installRbenvAndRuby)
  ipcMain.handle('install-gems', (_event, rubyCommand: string, gems: string[]) =>
    installGems(rubyCommand, gems)
  )
  ipcMain.handle('command-parser', (_event, command: string) => commandParser(command))
  ipcMain.handle('get-suites', getSuites)
  ipcMain.handle('create-suite', (_event, suiteName: string) =>
    createSuite(appState.mainWindow!, suiteName)
  )
  ipcMain.handle('delete-suite', (_event, suiteId: string) =>
    deleteSuite(appState.mainWindow!, suiteId)
  )
  ipcMain.handle(
    'run-test',
    (_event, suiteId: string, testId: string, projectPath: string, rubyCommand: string) => {
      const suite = appState.suites.get(suiteId)
      const test = suite?.tests.find((t) => t.id === testId)

      if (!test) {
        return { success: false, output: `Test with ID ${testId} not found.` }
      }

      const { implicitWait, explicitWait } = getRecordingSettings()
      return runRecording({ savedTest: test, implicitWait, explicitWait, projectPath, rubyCommand })
    }
  )
  ipcMain.handle(
    'update-recording-settings',
    async (_event, settings: { implicitWait: number; explicitWait: number }) => {
      try {
        return updateRecordingSettings(settings)
      } catch (error) {
        console.error('Failed to update recording settings:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'run-suite',
    (_event, suiteId: string, projectPath: string, rubyCommand: string) =>
      runSuite(suiteId, projectPath, rubyCommand)
  )
  ipcMain.handle('export-test', (_event, testData: TestData) => exportTest(testData))
  ipcMain.handle('export-suite', (_event, suiteId: string) => exportSuite(suiteId))
  ipcMain.handle('export-project', exportProject)
  ipcMain.handle('import-project', () => importProject(appState.mainWindow!))
  ipcMain.handle('import-suite', () => importSuite(appState.mainWindow!))
  ipcMain.handle('import-test', (_event, suiteId: string) =>
    importTest(appState.mainWindow!, suiteId)
  )
  ipcMain.handle('delete-test', (_event, args) => deleteTest(appState.mainWindow!, args))
  ipcMain.handle('load-url-request', (_event, url: string) => loadUrlRequest(url))
  ipcMain.handle('start-recording-main', startRecordingMain)
  ipcMain.handle('stop-recording-main', stopRecordingMain)
  ipcMain.handle('get-selector-priorities', getSelectorPriorities)
  ipcMain.handle('save-selector-priorities', (_event, priorities: string[]) =>
    saveSelectorPriorities(priorities)
  )

  ipcMain.on('recorder-event', (_event, data: RecorderEventData) => recorderEvent(data))

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
      { type: 'separator' },
      {
        label: 'Wait for element',
        submenu: [
          {
            label: 'to be displayed',
            click: () => {
              appState.mainWindow!.webContents.send('add-assertion-step', {
                type: 'wait-displayed',
                selector
              })
            }
          },
          {
            label: 'to be enabled',
            click: () => {
              appState.mainWindow!.webContents.send('add-assertion-step', {
                type: 'wait-enabled',
                selector
              })
            }
          }
        ]
      },
      {
        label: 'Assert element is displayed',
        click: () => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'displayed',
            selector
          })
        }
      },
      {
        label: 'Assert element is enabled',
        click: () => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'enabled',
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
    if (appState.recorderWindow) {
      menu.popup({ window: appState.recorderWindow })
    } else if (appState.mainWindow) {
      menu.popup({ window: appState.mainWindow })
    }
  })
})


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('ready', async () => {
  const fixPath = await import('fix-path')
  fixPath.default()
})

