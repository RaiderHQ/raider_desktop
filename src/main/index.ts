import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setMainWindow, appState } from './handlers/appState'
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
import { openReport, reportExists } from './handlers/openReport'
import { registerMediaScheme, registerMediaHandler } from './handlers/media/mediaProtocol'
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
import recorderEvent, {
  RecorderEventData,
  toElementTarget
} from './handlers/recording/recorderEvent'
import loadUrlRequest from './handlers/loadUrlRequest'
import startRecordingMain from './handlers/recording/startRecordingMain'
import replayStepsAndRecord from './handlers/recording/replayStepsAndRecord'
import replayInWebview, { cancelWebviewReplay } from './handlers/recording/replayInWebview'
import stopRecordingMain from './handlers/recording/stopRecordingMain'
import saveRecording from './handlers/recording/saveRecording'
import saveTrace from './handlers/trace/saveTrace'
import loadTrace from './handlers/trace/loadTrace'
import deleteTrace from './handlers/trace/deleteTrace'
import setActiveProject, { getRecorderSettings } from './handlers/project/setActiveProject'
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
import type { AssertKind, Step } from '@shared/types/step'
import type { AssertionMessage } from '@shared/types/pendingAssertion'
import { renderStep } from './codegen/steps'
import { toAutomation } from './codegen/testFile'
import { randomUUID } from 'crypto'

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

registerMediaScheme()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ruby-raider')
  registerMediaHandler()

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
  ipcMain.handle('open-report', (_event, projectPath: string) => openReport(projectPath))
  ipcMain.handle('report-exists', (_event, projectPath: string) => reportExists(projectPath))
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
  ipcMain.handle('render-step', (_event, step: Step) =>
    renderStep(step, toAutomation(appState.projectAutomation))
  )
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

      const { implicitWait, explicitWait, browser, headless } = appState.recorderSettings
      return runRecording({
        savedTest: test,
        implicitWait,
        explicitWait,
        browser,
        headless,
        projectPath,
        rubyCommand,
        projectAutomation: appState.projectAutomation,
        projectFramework: appState.projectFramework
      })
    }
  )
  ipcMain.handle(
    'update-recording-settings',
    async (
      _event,
      settings: Partial<{ implicitWait: number; explicitWait: number; selectorPriority: string[] }>
    ) => {
      try {
        return await updateRecordingSettings(settings)
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
  ipcMain.handle('set-active-project', (_event, projectPath: string | null) =>
    setActiveProject(projectPath)
  )
  ipcMain.handle('get-recorder-settings', () => getRecorderSettings())
  ipcMain.handle(
    'get-selector-priority',
    async () => (await getRecorderSettings()).selectorPriority
  )
  ipcMain.handle('load-url-request', (_event, url: string) => loadUrlRequest(url))
  ipcMain.handle('start-recording-main', startRecordingMain)
  ipcMain.handle(
    'replay-steps-and-record',
    (event, testName: string, stepsToReplay: Step[], rubyCommand: string) =>
      replayStepsAndRecord(event, testName, stepsToReplay, rubyCommand)
  )
  ipcMain.handle('cancel-replay', () => {
    if (appState.activeReplayProcess && !appState.activeReplayProcess.killed) {
      appState.activeReplayProcess.kill('SIGKILL')
      appState.activeReplayProcess = null
    }
    cancelWebviewReplay()
    return { success: true }
  })
  ipcMain.handle('replay-in-webview', (event, steps: Step[]) =>
    replayInWebview(event, steps)
  )
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
  ipcMain.on(
    'show-assertion-context-menu',
    (
      _event,
      {
        selector,
        strategy,
        ariaLabel,
        placeholder,
        elementText,
        elementValue,
        inputType,
        pageTitle,
        pageUrl
      }
    ): void => {
      if (!appState.mainWindow) return

      const element =
        toElementTarget(strategy, selector, { innerText: elementText, ariaLabel, placeholder }) ??
        undefined
      const post = (message: AssertionMessage): void => {
        appState.mainWindow!.webContents.send('add-assertion-step', message)
      }
      // Element waits and state checks are complete steps; the rest ask for expected text
      const wait = (until: 'visible' | 'hidden' | 'enabled'): void => {
        if (element) post({ id: randomUUID(), kind: 'wait', element, until })
      }
      const check = (kind: AssertKind): void => {
        if (element) post({ id: randomUUID(), kind: 'assert', check: kind, element })
      }
      const ask = (kind: AssertKind, text: string, needsElement = true): void => {
        if (needsElement && !element) return
        post({ pendingAssertion: kind, ...(needsElement ? { element } : {}), text })
      }

      const isCheckable = inputType === 'checkbox' || inputType === 'radio'

      const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
        { label: 'Raider Assertions', enabled: false },
        { type: 'separator' },

        // --- Wait submenu ---
        {
          label: 'Wait for element',
          submenu: [
            { label: 'to appear', click: (): void => wait('visible') },
            { label: 'to disappear', click: (): void => wait('hidden') },
            { label: 'to be enabled', click: (): void => wait('enabled') }
          ]
        },
        { type: 'separator' },

        // --- Assert element state ---
        { label: 'Assert element is displayed', click: (): void => check('displayed') },
        { label: 'Assert element is NOT displayed', click: (): void => check('notDisplayed') },
        { label: 'Assert element is enabled', click: (): void => check('enabled') },
        ...(isCheckable
          ? [{ label: 'Assert element is checked', click: (): void => check('checked') }]
          : []),
        { type: 'separator' },

        // --- Assert content ---
        {
          label: 'Assert element text equals',
          click: (): void => ask('textEquals', (elementText || '').trim())
        },
        {
          label: 'Assert element text includes',
          click: (): void => ask('textIncludes', (elementText || '').trim())
        },
        {
          label: 'Assert element value',
          click: (): void => ask('valueEquals', (elementValue || '').trim())
        },
        { type: 'separator' },

        // --- Assert page ---
        {
          label: 'Assert page title',
          click: (): void => ask('titleEquals', pageTitle || '', false)
        },
        {
          label: 'Assert current URL contains',
          click: (): void => ask('urlIncludes', pageUrl || '', false)
        }
      ]

      const menu = Menu.buildFromTemplate(template)
      if (appState.recorderWindow) {
        menu.popup({ window: appState.recorderWindow })
      } else if (appState.mainWindow) {
        menu.popup({ window: appState.mainWindow })
      }
    }
  )
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
