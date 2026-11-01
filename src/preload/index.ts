import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FileNode } from '@foundation/Types/fileNode'
import type { CommandType } from '@foundation/Types/commandType'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import type { TraceStep } from '@foundation/Types/traceStep'
import type { Step } from '@shared/types/step'
import type { QuickProject } from '@shared/types/quickProject'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type {
  LegacyRunResult,
  PrepareSuiteRunResult,
  PrepareTestRunResult
} from '@shared/types/prepareRun'
import type { CodeTestView, ProjectTestEntry } from '@shared/types/projectTest'
import type { SavedLoginsResult } from '@shared/types/savedLogins'
import type {
  DeviceSettings,
  DeviceSettingsChange,
  MobileReady
} from '@shared/types/deviceSettings'
import type {
  ActiveRun,
  RunDefaults,
  RunEvent,
  RunRequest,
  StartRunResult
} from '@shared/types/runEvents'

declare global {
  interface Window {
    electron: typeof electronAPI
    api: typeof api
  }
}

const api = {
  runRubyRaider: async (
    folderPath: string,
    projectName: string,
    framework: string,
    automation: string,
    rubyCommand: string,
    mobile: string | null = null,
    options?: ProjectCreationOptions
  ): Promise<CommandType> => {
    return ipcRenderer.invoke(
      'run-ruby-raider',
      folderPath,
      projectName,
      framework,
      automation,
      rubyCommand,
      mobile,
      options
    )
  },
  selectFolder: async (title: string): Promise<string | null> =>
    ipcRenderer.invoke('select-folder', title),
  readDirectory: async (folderPath: string): Promise<FileNode[]> =>
    ipcRenderer.invoke('read-directory', folderPath),
  readFile: async (
    filePath: string
  ): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> =>
    ipcRenderer.invoke('read-file', filePath),
  readImage: async (
    filePath: string
  ): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> =>
    ipcRenderer.invoke('read-image', filePath),
  editFile: async (
    filePath: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('edit-file', filePath, newContent),
  deleteFile: async (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-file', filePath),
  renameFile: async (
    filePath: string,
    newName: string
  ): Promise<{ success: boolean; newPath?: string; error?: string }> =>
    ipcRenderer.invoke('rename-file', filePath, newName),
  duplicateFile: async (
    filePath: string
  ): Promise<{ success: boolean; newPath?: string; error?: string }> =>
    ipcRenderer.invoke('duplicate-file', filePath),
  openReport: async (projectPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-report', projectPath),
  reportExists: async (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('report-exists', projectPath),
  createQuickProject: async (
    url: string,
    rubyCommand: string
  ): Promise<{ success: true; projectPath: string } | { success: false; error: string }> =>
    ipcRenderer.invoke('create-quick-project', url, rubyCommand),
  isQuickProject: async (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('is-quick-project', projectPath),
  listQuickProjects: async (): Promise<QuickProject[]> => ipcRenderer.invoke('list-quick-projects'),
  saveQuickProjectTo: async (
    projectPath: string,
    destFolder: string
  ): Promise<{ success: true; projectPath: string } | { success: false; error: string }> =>
    ipcRenderer.invoke('save-quick-project-to', projectPath, destFolder),
  updateBrowserUrl: async (
    projectPath: string,
    url: string
  ): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('update-browser-url', projectPath, url),
  updateBrowserType: async (
    projectPath: string,
    browser: string
  ): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('update-browser-type', projectPath, browser),
  runCommand: async (command: string): Promise<CommandType> =>
    ipcRenderer.invoke('run-command', command),
  installGems: async (rubyCommand: string, gems: string[]): Promise<CommandType> =>
    ipcRenderer.invoke('install-gems', rubyCommand, gems),
  isRubyInstalled: async (): Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
    missingGems?: string[]
    rubyCommand?: string
    versionWarning?: string
  }> => ipcRenderer.invoke('is-ruby-installed'),
  isRbenvRubyInstalled: async (): Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }> => ipcRenderer.invoke('is-rbenv-ruby-installed'),
  isRvmRubyInstalled: async (): Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }> => ipcRenderer.invoke('is-rvm-ruby-installed'),
  isSystemRubyInstalled: async (): Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }> => ipcRenderer.invoke('is-system-ruby-installed'),
  installRbenvAndRuby: async (): Promise<{
    success: boolean
    output?: string
    error?: string
  }> => ipcRenderer.invoke('install-rbenv-and-ruby'),
  getDeviceSettings: async (projectPath: string): Promise<DeviceSettings | { error: string }> =>
    ipcRenderer.invoke('get-device-settings', projectPath),
  saveDeviceSettings: async (
    projectPath: string,
    change: DeviceSettingsChange
  ): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('save-device-settings', projectPath, change),
  checkMobileReady: async (projectPath: string): Promise<MobileReady | { error: string }> =>
    ipcRenderer.invoke('check-mobile-ready', projectPath),
  chooseAppFile: async (
    projectPath: string,
    platform: 'ios' | 'android'
  ): Promise<{ path: string } | { cancelled: true } | { error: string }> =>
    ipcRenderer.invoke('choose-app-file', projectPath, platform),

  // --- Recorder and Test Suite APIs ---

  // Suite Management
  getSuites: async (): Promise<Suite[]> => ipcRenderer.invoke('get-suites'),
  listProjectTests: (): Promise<ProjectTestEntry[]> => ipcRenderer.invoke('list-project-tests'),
  openCodeTest: (file: string): Promise<CodeTestView> => ipcRenderer.invoke('open-code-test', file),
  getProjectLayout: (): Promise<ProjectLayout | null> => ipcRenderer.invoke('get-project-layout'),
  recordOverExample: (
    file: string,
    exampleName: string,
    steps: Step[],
    rubyCommand: string
  ): Promise<
    | { success: true }
    | { success: false; error: 'notUnique'; count: number }
    | { success: false; error: string }
  > => ipcRenderer.invoke('record-over-example', file, exampleName, steps, rubyCommand),
  createSuite: async (
    suiteName: string
  ): Promise<{ success: boolean; suite?: Suite; error?: string }> =>
    ipcRenderer.invoke('create-suite', suiteName),
  deleteSuite: async (suiteId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('delete-suite', suiteId),
  runSuite: async (
    suiteId: string,
    projectPath: string,
    rubyCommand: string
  ): Promise<LegacyRunResult> =>
    ipcRenderer.invoke('run-suite', suiteId, projectPath, rubyCommand),
  prepareTestRun: (suiteId: string, testId: string, test?: Test): Promise<PrepareTestRunResult> =>
    ipcRenderer.invoke('prepare-test-run', suiteId, testId, test),
  prepareSuiteRun: (suiteId: string): Promise<PrepareSuiteRunResult> =>
    ipcRenderer.invoke('prepare-suite-run', suiteId),
  exportSuite: (suiteId: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export-suite', suiteId),
  exportProject: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export-project'),
  importProject: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('import-project'),
  importSuite: (): Promise<{ success: boolean; suite?: Suite; error?: string }> =>
    ipcRenderer.invoke('import-suite'),
  importTest: (suiteId: string): Promise<{ success: boolean; test?: Test; error?: string }> =>
    ipcRenderer.invoke('import-test', suiteId),

  // Test Management
  saveRecording: async (
    suiteId: string,
    testData: Test
  ): Promise<{ success: boolean; error?: string; test?: Test }> =>
    ipcRenderer.invoke('save-recording', suiteId, testData),
  deleteTest: (suiteId: string, testId: string): Promise<void> =>
    ipcRenderer.invoke('delete-test', { suiteId, testId }),
  saveTrace: (testId: string, trace: TraceStep[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-trace', testId, trace),
  loadTrace: (testId: string): Promise<{ success: boolean; trace?: TraceStep[] }> =>
    ipcRenderer.invoke('load-trace', testId),
  deleteTrace: (testId: string): Promise<void> => ipcRenderer.invoke('delete-trace', testId),
  // Recording Session Control
  startRecordingMain: async (): Promise<{
    success: boolean
    url: string
    preloadPath: string
    reason?: 'unsupportedUrl'
  }> =>
    ipcRenderer.invoke('start-recording-main'),
  replayStepsAndRecord: async (
    testName: string,
    stepsToReplay: Step[],
    rubyCommand: string
  ): Promise<{
    success: boolean
    url?: string
    preloadPath?: string
    error?: string
    cancelled?: boolean
  }> => ipcRenderer.invoke('replay-steps-and-record', testName, stepsToReplay, rubyCommand),
  cancelReplay: async (): Promise<{ success: boolean }> => ipcRenderer.invoke('cancel-replay'),
  replayInWebview: async (
    steps: Step[]
  ): Promise<{
    success: boolean
    error?: string
    failedStepId?: string
    cancelled?: boolean
    skippedStepIds?: string[]
  }> => ipcRenderer.invoke('replay-in-webview', steps),
  registerRecorderWebContents: async (webContentsId: number): Promise<void> =>
    ipcRenderer.invoke('register-recorder-webcontents', webContentsId),
  stopRecordingMain: async (): Promise<CommandType> => ipcRenderer.invoke('stop-recording-main'),
  /** Tells main whether a recording is open, so closing the window saves it first */
  setRecordingState: (active: boolean): void => ipcRenderer.send('recording-state', active),
  /** Main asks the page to save its recording before the window closes; returns an unsubscribe */
  onFlushRecording: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('flush-recording', listener)
    return (): void => {
      ipcRenderer.removeListener('flush-recording', listener)
    }
  },
  flushRecordingDone: (): void => ipcRenderer.send('flush-recording-done'),
  // --- Live test runs (RunApi) ---
  startRun: async (request: RunRequest): Promise<StartRunResult> =>
    ipcRenderer.invoke('start-run', request),
  cancelRun: async (runId: string): Promise<void> => ipcRenderer.invoke('cancel-run', runId),
  getActiveRun: async (): Promise<ActiveRun | null> => ipcRenderer.invoke('get-active-run'),
  getRunDefaults: async (): Promise<RunDefaults> => ipcRenderer.invoke('get-run-defaults'),
  // --- Saved logins (active project) ---
  listSavedLogins: async (): Promise<SavedLoginsResult> => ipcRenderer.invoke('list-saved-logins'),
  forgetSavedLogin: async (name: string): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('forget-saved-login', name),
  /** Subscribes to live run events; the returned function removes only this subscription */
  onRunEvent: (callback: (event: RunEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, runEvent: RunEvent): void => callback(runEvent)
    ipcRenderer.on('run-event', listener)
    return (): void => {
      ipcRenderer.removeListener('run-event', listener)
    }
  },
  loadUrlRequest: async (url: string): Promise<CommandType> =>
    ipcRenderer.invoke('load-url-request', url),
  renderStep: (step: Step): Promise<string> => ipcRenderer.invoke('render-step', step),
  exportTest: (
    testName: string,
    steps: Step[]
  ): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export-test', { testName, steps }),
  runTest: async (
    suiteId: string,
    testId: string,
    projectPath: string,
    rubyCommand: string,
    test?: Test
  ): Promise<LegacyRunResult> =>
    ipcRenderer.invoke('run-test', suiteId, testId, projectPath, rubyCommand, test),
  updateRecordingSettings: (
    settings: Partial<{ implicitWait: number; explicitWait: number; selectorPriority: string[] }>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('update-recording-settings', settings),
  setActiveProject: (
    projectPath: string | null
  ): Promise<{
    success: boolean
    settings?: RecorderSettings
    layout?: ProjectLayout
    error?: string
  }> => ipcRenderer.invoke('set-active-project', projectPath),
  getRecorderSettings: (): Promise<RecorderSettings> => ipcRenderer.invoke('get-recorder-settings'),
  onTestsMigrated: (
    callback: (event: IpcRendererEvent, info: { migrated: number; postponed: boolean }) => void
  ): Electron.IpcRenderer => ipcRenderer.on('tests-migrated', callback),
  removeTestsMigratedListener: (
    callback: (event: IpcRendererEvent, info: { migrated: number; postponed: boolean }) => void
  ): Electron.IpcRenderer => ipcRenderer.removeListener('tests-migrated', callback),
  onSuitesTooNew: (callback: (event: IpcRendererEvent) => void): Electron.IpcRenderer =>
    ipcRenderer.on('suites-too-new', callback),
  removeSuitesTooNewListener: (callback: (event: IpcRendererEvent) => void): Electron.IpcRenderer =>
    ipcRenderer.removeListener('suites-too-new', callback),
  closeApp: (): Promise<void> => ipcRenderer.invoke('close-app'),

  // --- Scaffolding APIs ---
  scaffoldGenerate: async (
    params: Record<string, unknown>,
    projectPath: string,
    rubyCommand: string
  ): Promise<{ success: boolean; output: string; error?: string }> =>
    ipcRenderer.invoke('scaffold-generate', params, projectPath, rubyCommand),

  // --- Extended Project Settings APIs ---
  updateTimeout: async (projectPath: string, seconds: number): Promise<CommandType> =>
    ipcRenderer.invoke('update-timeout', projectPath, seconds),
  updateViewport: async (
    projectPath: string,
    width: number,
    height: number
  ): Promise<CommandType> =>
    ipcRenderer.invoke('update-viewport', projectPath, width, height),
  updateBrowserOptions: async (
    projectPath: string,
    options: string[]
  ): Promise<CommandType> =>
    ipcRenderer.invoke('update-browser-options', projectPath, options),
  updateHeadlessMode: async (
    projectPath: string,
    enabled: boolean
  ): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('update-headless-mode', projectPath, enabled),
  getProjectConfig: async (
    projectPath: string
  ): Promise<{
    success: boolean
    config?: {
      baseUrl?: string
      browser?: string
      headless?: boolean
      timeout?: number
      browserArguments?: string[]
    }
    error?: string
  }> => ipcRenderer.invoke('get-project-config', projectPath),

  // --- Path Configuration APIs ---
  updatePaths: async (
    projectPath: string,
    pathValue: string,
    pathType?: string
  ): Promise<CommandType> => ipcRenderer.invoke('update-paths', projectPath, pathValue, pathType),

  // --- Longship Integration APIs ---
  getLongshipConfig: async (): Promise<{
    url: string
    apiKey: string
    enabled: boolean
  }> => ipcRenderer.invoke('get-longship-config'),
  setLongshipConfig: async (config: {
    url?: string
    apiKey?: string
    enabled?: boolean
  }): Promise<{ url: string; apiKey: string; enabled: boolean }> =>
    ipcRenderer.invoke('set-longship-config', config),

  // --- Terminal APIs ---
  terminalSpawn: async (cwd: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal-spawn', cwd, cols, rows),
  terminalWrite: async (data: string): Promise<void> => ipcRenderer.invoke('terminal-write', data),
  terminalResize: async (cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal-resize', cols, rows),
  terminalKill: async (): Promise<void> => ipcRenderer.invoke('terminal-kill'),
  onTerminalData: (
    callback: (event: IpcRendererEvent, data: string) => void
  ): Electron.IpcRenderer => ipcRenderer.on('terminal-data', callback),
  removeTerminalDataListener: (
    callback: (event: IpcRendererEvent, data: string) => void
  ): Electron.IpcRenderer => ipcRenderer.removeListener('terminal-data', callback),
  onTerminalExit: (callback: (event: IpcRendererEvent) => void): Electron.IpcRenderer =>
    ipcRenderer.on('terminal-exit', callback),
  removeTerminalExitListener: (callback: (event: IpcRendererEvent) => void): Electron.IpcRenderer =>
    ipcRenderer.removeListener('terminal-exit', callback)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    // Deliberately empty
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
