import type { FileNode } from '@shared/types/fileNode'
import type { CommandType } from '@shared/types/commandType'
import type { Suite } from '@shared/types/suite'
import type { Test } from '@shared/types/test'
import type { TraceStep } from '@shared/types/traceStep'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import type { IpcRendererEvent } from 'electron'

export interface WindowApi {
  // --- Project Management ---
  runRubyRaider: (
    folderPath: string,
    projectName: string,
    framework: string,
    automation: string,
    rubyCommand: string,
    mobile?: string | null,
    options?: ProjectCreationOptions
  ) => Promise<CommandType>
  selectFolder: (title: string) => Promise<string | null>
  readDirectory: (folderPath: string) => Promise<FileNode[]>
  readFile: (
    filePath: string
  ) => Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }>
  readImage: (
    filePath: string
  ) => Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }>
  editFile: (filePath: string, newContent: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (filePath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  duplicateFile: (filePath: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  openAllure: () => Promise<{ success: boolean; output?: string; error?: string }>

  // --- Ruby & Dependencies ---
  isRubyInstalled: () => Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
    missingGems?: string[]
    rubyCommand?: string
    versionWarning?: string
  }>
  isRbenvRubyInstalled: () => Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }>
  isRvmRubyInstalled: () => Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }>
  isSystemRubyInstalled: () => Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
  }>
  installRbenvAndRuby: () => Promise<{
    success: boolean
    output?: string
    error?: string
  }>
  installRaider: () => Promise<CommandType>
  installGems: (rubyCommand: string, gems: string[]) => Promise<CommandType>

  // --- Browser & Mobile Configuration ---
  updateBrowserUrl: (
    projectPath: string,
    url: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  updateBrowserType: (
    projectPath: string,
    browser: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  isMobileProject: (
    projectPath: string
  ) => Promise<{ success: boolean; isMobileProject?: boolean; error?: string }>
  updateMobileCapabilities: (
    projectPath: string,
    capabilities: {
      platformVersion: string
      automationName: string
      deviceName: string
      app: string
    }
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  getMobileCapabilities: (
    projectPath: string
  ) => Promise<{ success: boolean; capabilities?: Record<string, unknown>; error?: string }>

  // --- Test Execution ---
  runCommand: (command: string) => Promise<CommandType>
  runRaiderTests: (
    folderPath: string,
    rubyCommand: string,
    parallel?: boolean
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  runRakeTask: (
    folderPath: string,
    rubyCommand: string,
    taskName: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  rerunFailedTests: (
    folderPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  runTest: (
    suiteId: string,
    testId: string,
    projectPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output: string }>
  runSuite: (
    suiteId: string,
    projectPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output: string }>

  // --- Command Parsing ---
  xpathParser: (command: string) => Promise<string>
  commandParser: (command: string) => Promise<string>

  // --- Suite Management ---
  getSuites: () => Promise<Suite[]>
  createSuite: (suiteName: string) => Promise<{ success: boolean; suite?: Suite; error?: string }>
  deleteSuite: (suiteId: string) => Promise<{ success: boolean }>
  exportSuite: (suiteId: string) => Promise<{ success: boolean; path?: string; error?: string }>
  exportProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  importProject: () => Promise<{ success: boolean; error?: string }>
  importSuite: () => Promise<{ success: boolean; suite?: Suite; error?: string }>
  importTest: (suiteId: string) => Promise<{ success: boolean; test?: Test; error?: string }>

  // --- Test Management ---
  saveRecording: (suiteId: string, testData: Test) => Promise<{ success: boolean; error?: string }>
  deleteTest: (suiteId: string, testId: string) => Promise<void>
  exportTest: (
    testName: string,
    steps: string[]
  ) => Promise<{ success: boolean; path?: string; error?: string }>

  // --- Recording Session ---
  startRecordingMain: () => Promise<{ success: boolean; url: string; preloadPath: string }>
  registerRecorderWebContents: (webContentsId: number) => Promise<void>
  stopRecordingMain: () => Promise<CommandType>
  loadUrlRequest: (url: string) => Promise<CommandType>
  updateRecordingSettings: (settings: {
    implicitWait: number
    explicitWait: number
  }) => Promise<{ success: boolean; error?: string }>

  // --- Trace Management ---
  saveTrace: (testId: string, trace: TraceStep[]) => Promise<{ success: boolean; error?: string }>
  loadTrace: (testId: string) => Promise<{ success: boolean; trace?: TraceStep[] }>
  deleteTrace: (testId: string) => Promise<void>

  // --- Event Listeners ---
  onTestRunStatus: (
    callback: (event: IpcRendererEvent, ...args: { status: string }[]) => void
  ) => Electron.IpcRenderer
  removeTestRunStatusListener: (
    callback: (event: IpcRendererEvent, ...args: { status: string }[]) => void
  ) => Electron.IpcRenderer

  // --- Scaffolding ---
  scaffoldGenerate: (
    params: Record<string, unknown>,
    projectPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output: string; error?: string }>

  // --- Extended Project Settings ---
  updateTimeout: (projectPath: string, seconds: number) => Promise<CommandType>
  updateViewport: (projectPath: string, width: number, height: number) => Promise<CommandType>
  updateDebugMode: (projectPath: string, enabled: boolean) => Promise<CommandType>
  updateBrowserOptions: (projectPath: string, options: string[]) => Promise<CommandType>
  updateHeadlessMode: (
    projectPath: string,
    enabled: boolean
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  getProjectConfig: (
    projectPath: string
  ) => Promise<{
    success: boolean
    config?: {
      baseUrl?: string
      browser?: string
      headless?: boolean
    }
    error?: string
  }>
  startAppium: (projectPath: string) => Promise<CommandType>

  // --- Path Configuration ---
  updatePaths: (projectPath: string, pathValue: string, pathType?: string) => Promise<CommandType>

  // --- Terminal ---
  terminalSpawn: (cwd: string, cols: number, rows: number) => Promise<void>
  terminalWrite: (data: string) => Promise<void>
  terminalResize: (cols: number, rows: number) => Promise<void>
  terminalKill: () => Promise<void>
  onTerminalData: (callback: (event: IpcRendererEvent, data: string) => void) => Electron.IpcRenderer
  removeTerminalDataListener: (callback: (event: IpcRendererEvent, data: string) => void) => Electron.IpcRenderer
  onTerminalExit: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer
  removeTerminalExitListener: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer

  // --- App Lifecycle ---
  closeApp: () => Promise<void>
}
