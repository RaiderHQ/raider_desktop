import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setMainWindow, appState, getRecordingSettings } from './handlers/appState'
import { getLongshipConfig, setLongshipConfig, LongshipConfig } from './handlers/longship/longshipConfig'
import type { Test } from '@foundation/Types/test'
import type { TestData } from '@foundation/Types/testData'
import type { TraceStep } from '@foundation/Types/traceStep'
import selectFolder from './handlers/project/selectFolder'
import readDirectory from './handlers/io/readDirectory'
import runRubyRaider from './handlers/project/runRubyRaider'
import runRaiderTests from './handlers/testing/runRaiderTests'
import runRakeTask from './handlers/testing/runRakeTask'
import rerunFailedTests from './handlers/testing/rerunFailedTests'
import readFile from './handlers/io/readFile'
import readImage from './handlers/io/readImage'
import openAllure from './handlers/openAllure'
import editFile from './handlers/io/editFile'
import deleteFile from './handlers/io/deleteFile'
import renameFile from './handlers/io/renameFile'
import duplicateFile from './handlers/io/duplicateFile'
import updateBrowserUrl from './handlers/config/updateBrowserUrl'
import updateBrowserType from './handlers/config/updateBrowserType'
import isMobileProject from './handlers/config/isMobileProject'
import runCommand from './handlers/testing/runCommand'
import installRaider from './handlers/ruby/installRaider'
import updateMobileCapabilities from './handlers/config/updateMobileCapabilities'
import getMobileCapabilities from './handlers/config/getMobileCapabilities'
import isRubyInstalled from './handlers/ruby/isRubyInstalled'
import isRbenvRubyInstalled from './handlers/ruby/isRbenvRubyInstalled'
import isRvmRubyInstalled from './handlers/ruby/isRvmRubyInstalled'
import isSystemRubyInstalled from './handlers/ruby/isSystemRubyInstalled'
import installRbenvAndRuby from './handlers/ruby/installRbenvAndRuby'
import installGems from './handlers/ruby/installGems'
import runRecording from './handlers/testing/runRecording'
import xpathParser from './handlers/xpathParser'
import commandParser from './handlers/commandParser'
import getSuites from './handlers/getSuites'
import createSuite from './handlers/createSuite'
import deleteSuite from './handlers/deleteSuite'
import runSuite from './handlers/testing/runSuite'
import exportTest from './handlers/io/exportTest'
import exportSuite from './handlers/io/exportSuite'
import exportProject from './handlers/io/exportProject'
import importProject from './handlers/io/importProject'
import importSuite from './handlers/io/importSuite'
import importTest from './handlers/io/importTest'
import deleteTest from './handlers/deleteTest'
import recorderEvent, { RecorderEventData } from './handlers/recording/recorderEvent'
import loadUrlRequest from './handlers/loadUrlRequest'
import startRecordingMain from './handlers/recording/startRecordingMain'
import stopRecordingMain from './handlers/recording/stopRecordingMain'
import saveRecording from './handlers/recording/saveRecording'
import saveTrace from './handlers/trace/saveTrace'
import loadTrace from './handlers/trace/loadTrace'
import deleteTrace from './handlers/trace/deleteTrace'
import updateRecordingSettings from './handlers/config/updateRecordingSettings'
import { closeApp } from './handlers/closeApp'
import scaffoldGenerate from './handlers/project/scaffoldGenerate'
import updateTimeout from './handlers/config/updateTimeout'
import updateViewport from './handlers/config/updateViewport'
import updateDebugMode from './handlers/config/updateDebugMode'
import updateBrowserOptions from './handlers/config/updateBrowserOptions'
import startAppium from './handlers/config/startAppium'
import updatePaths from './handlers/config/updatePaths'
import updateHeadlessMode from './handlers/config/updateHeadlessMode'
import getProjectConfig from './handlers/config/getProjectConfig'
import { spawnTerminal, writeTerminal, resizeTerminal, killTerminal } from './handlers/terminal/terminalManager'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'

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
      sandbox: false,
      contextIsolation: process.env.NODE_ENV !== 'test',
      webviewTag: true
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
  ipcMain.handle('delete-file', deleteFile)
  ipcMain.handle('rename-file', renameFile)
  ipcMain.handle('duplicate-file', duplicateFile)
  ipcMain.handle(
    'run-ruby-raider',
    (
      event,
      folderPath: string,
      projectName: string,
      framework: string,
      automation: string,
      rubyCommand: string,
      mobile: string | null,
      options?: ProjectCreationOptions
    ) =>
      runRubyRaider(event, folderPath, projectName, framework, automation, rubyCommand, mobile, options)
  )
  ipcMain.handle(
    'run-raider-tests',
    (_event, folderPath: string, rubyCommand: string, parallel?: boolean) =>
      runRaiderTests(appState.mainWindow!, folderPath, rubyCommand, parallel)
  )
  ipcMain.handle(
    'run-rake-task',
    (_event, folderPath: string, rubyCommand: string, taskName: string) =>
      runRakeTask(appState.mainWindow!, folderPath, rubyCommand, taskName)
  )
  ipcMain.handle(
    'rerun-failed-tests',
    (_event, folderPath: string, rubyCommand: string) =>
      rerunFailedTests(appState.mainWindow!, folderPath, rubyCommand)
  )
  ipcMain.handle('is-mobile-project', isMobileProject)
  ipcMain.handle('update-browser-url', (event, projectPath: string, url: string) =>
    updateBrowserUrl(event, projectPath, url)
  )
  ipcMain.handle('update-browser-type', (event, projectPath: string, browser: string) =>
    updateBrowserType(event, projectPath, browser)
  )
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
  ipcMain.handle('xpath-parser', (_event, command: string) => {
    return xpathParser(command)
  })
  ipcMain.handle('command-parser', (_event, command: string) => {
    return commandParser(command)
  })
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
      return runRecording({
        savedTest: test,
        implicitWait,
        explicitWait,
        projectPath,
        rubyCommand,
        projectAutomation: appState.projectAutomation,
        projectFramework: appState.projectFramework
      })
    }
  )
  ipcMain.handle(
    'update-recording-settings',
    async (_event, settings: { implicitWait: number; explicitWait: number }) => {
      try {
        return updateRecordingSettings(settings)
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('run-suite', (_event, suiteId: string, _projectPath: string, rubyCommand: string) =>
    runSuite(suiteId, rubyCommand)
  )
  ipcMain.handle('export-test', (_event, testData: TestData) => exportTest(testData))
  ipcMain.handle('export-suite', (_event, suiteId: string) => exportSuite(suiteId))
  ipcMain.handle('export-project', exportProject)
  ipcMain.handle('import-project', () => importProject(appState.mainWindow!))
  ipcMain.handle('import-suite', () => importSuite(appState.mainWindow!))
  ipcMain.handle('import-test', (_event, suiteId: string) =>
    importTest(appState.mainWindow!, suiteId)
  )
  ipcMain.handle('delete-test', async (_event, args) => {
    const result = await deleteTest(appState.mainWindow!, args)
    deleteTrace(args.testId)
    return result
  })
  ipcMain.handle('load-url-request', (_event, url: string) => loadUrlRequest(url))
  ipcMain.handle('start-recording-main', startRecordingMain)
  ipcMain.handle('stop-recording-main', stopRecordingMain)
  ipcMain.on('recorder-event', (_event, data: RecorderEventData) => recorderEvent(data))
  ipcMain.handle('register-recorder-webcontents', (_event, webContentsId: number) => {
    appState.recorderWebContentsId = webContentsId
  })

  ipcMain.handle('save-recording', (_event, suiteId: string, test: Test) =>
    saveRecording(appState.mainWindow, suiteId, test)
  )
  ipcMain.handle('save-trace', (_event, testId: string, trace: TraceStep[]) =>
    saveTrace(testId, trace)
  )
  ipcMain.handle('load-trace', (_event, testId: string) => loadTrace(testId))
  ipcMain.handle('delete-trace', (_event, testId: string) => deleteTrace(testId))
  ipcMain.handle('close-app', closeApp)

  // --- Scaffolding Handler ---
  ipcMain.handle('scaffold-generate', scaffoldGenerate)

  // --- Project Settings Handlers ---
  ipcMain.handle('update-timeout', (event, projectPath: string, seconds: number) =>
    updateTimeout(event, projectPath, seconds)
  )
  ipcMain.handle('update-viewport', (event, projectPath: string, width: number, height: number) =>
    updateViewport(event, projectPath, width, height)
  )
  ipcMain.handle('update-debug-mode', (event, projectPath: string, enabled: boolean) =>
    updateDebugMode(event, projectPath, enabled)
  )
  ipcMain.handle('update-browser-options', (event, projectPath: string, options: string[]) =>
    updateBrowserOptions(event, projectPath, options)
  )
  ipcMain.handle('update-headless-mode', (event, projectPath: string, enabled: boolean) =>
    updateHeadlessMode(event, projectPath, enabled)
  )
  ipcMain.handle('get-project-config', (_event, projectPath: string) =>
    getProjectConfig(projectPath)
  )
  ipcMain.handle('start-appium', (event, projectPath: string) =>
    startAppium(event, projectPath)
  )

  // --- Path Configuration Handler ---
  ipcMain.handle(
    'update-paths',
    (event, projectPath: string, pathValue: string, pathType?: string) =>
      updatePaths(event, projectPath, pathValue, pathType as 'feature' | 'spec' | 'helper' | undefined)
  )

  // --- Longship Integration Handlers ---
  ipcMain.handle('get-longship-config', () => getLongshipConfig())
  ipcMain.handle('set-longship-config', (_event, config: Partial<LongshipConfig>) =>
    setLongshipConfig(config)
  )

  // --- Terminal Handlers ---
  ipcMain.handle('terminal-spawn', (_event, cwd: string, cols: number, rows: number) => {
    spawnTerminal(appState.mainWindow!, cwd, cols, rows)
  })
  ipcMain.handle('terminal-write', (_event, data: string) => {
    writeTerminal(data)
  })
  ipcMain.handle('terminal-resize', (_event, cols: number, rows: number) => {
    resizeTerminal(cols, rows)
  })
  ipcMain.handle('terminal-kill', () => {
    killTerminal()
  })

  // --- Assertion Context Menu Handler ---
  ipcMain.on('show-assertion-context-menu', (_event, { selector, elementText }): void => {
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
            click: (): void => {
              appState.mainWindow!.webContents.send('add-assertion-step', {
                type: 'wait-displayed',
                selector
              })
            }
          },
          {
            label: 'to be enabled',
            click: (): void => {
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
        click: (): void => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'displayed',
            selector
          })
        }
      },
      {
        label: 'Assert element is enabled',
        click: (): void => {
          appState.mainWindow!.webContents.send('add-assertion-step', {
            type: 'enabled',
            selector
          })
        }
      },
      {
        label: 'Assert element contains text',
        click: (): void => {
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
