import type { FileNode } from '@shared/types/fileNode'
import type { CommandType } from '@shared/types/commandType'
import type { Suite } from '@shared/types/suite'
import type { Test } from '@shared/types/test'
import type { TraceStep } from '@shared/types/traceStep'
import type { Step } from '@shared/types/step'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type { PrepareSuiteRunResult, PrepareTestRunResult } from '@shared/types/prepareRun'
import type { CodeTestView, ProjectTestEntry } from '@shared/types/projectTest'
import type { QuickProject } from '@shared/types/quickProject'
import type { IpcRendererEvent } from 'electron'
import type { RunApi } from '@shared/types/runEvents'
import type { SavedLoginsResult } from '@shared/types/savedLogins'
import type { DeviceSettings, DeviceSettingsChange } from '@shared/types/deviceSettings'

/** Live-run methods (startRun, cancelRun, getActiveRun, getRunDefaults, onRunEvent) come from RunApi. */
export interface WindowApi extends RunApi {
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
  createQuickProject: (
    url: string,
    rubyCommand: string
  ) => Promise<{ success: true; projectPath: string } | { success: false; error: string }>
  isQuickProject: (projectPath: string) => Promise<boolean>
  /** Quick record projects in Raider's own folder, newest first */
  listQuickProjects: () => Promise<QuickProject[]>
  saveQuickProjectTo: (
    projectPath: string,
    destFolder: string
  ) => Promise<{ success: true; projectPath: string } | { success: false; error: string }>
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
  renameFile: (
    filePath: string,
    newName: string
  ) => Promise<{ success: boolean; newPath?: string; error?: string }>
  duplicateFile: (
    filePath: string
  ) => Promise<{ success: boolean; newPath?: string; error?: string }>
  openReport: (projectPath: string) => Promise<{ success: boolean; error?: string }>
  reportExists: (projectPath: string) => Promise<boolean>

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
  getDeviceSettings: (projectPath: string) => Promise<DeviceSettings | { error: string }>
  saveDeviceSettings: (
    projectPath: string,
    change: DeviceSettingsChange
  ) => Promise<{ ok: true } | { error: string }>

  // --- Test Execution ---
  runCommand: (command: string) => Promise<CommandType>
  /** `test`, when given, is saved before it runs, so the run never lags behind the editor */
  runTest: (
    suiteId: string,
    testId: string,
    projectPath: string,
    rubyCommand: string,
    test?: Test
  ) => Promise<{ success: boolean; output: string }>
  runSuite: (
    suiteId: string,
    projectPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output: string }>
  /** Saves `test` when needed and returns the spec file to run live; runs nothing */
  prepareTestRun: (suiteId: string, testId: string, test?: Test) => Promise<PrepareTestRunResult>
  /** Restores missing recorded files and returns the suite's spec files; runs nothing */
  prepareSuiteRun: (suiteId: string) => Promise<PrepareSuiteRunResult>

  // --- Step Rendering ---
  /** Ruby for one step, in the active project's automation (Selenium or Watir). */
  renderStep: (step: Step) => Promise<string>

  // --- Suite Management ---
  getSuites: () => Promise<Suite[]>
  /** Every spec file of the active project (recorded or hand-written); [] without a project */
  listProjectTests: () => Promise<ProjectTestEntry[]>
  /** Read-only view of a listed spec file; rejects for any other path */
  openCodeTest: (file: string) => Promise<CodeTestView>
  getProjectLayout: () => Promise<ProjectLayout | null>
  /** Replaces the one example named `exampleName` in a listed spec file with `steps` */
  recordOverExample: (
    file: string,
    exampleName: string,
    steps: Step[],
    rubyCommand: string
  ) => Promise<
    | { success: true }
    | { success: false; error: 'notUnique'; count: number }
    | { success: false; error: string }
  >
  createSuite: (suiteName: string) => Promise<{ success: boolean; suite?: Suite; error?: string }>
  deleteSuite: (suiteId: string) => Promise<{ success: boolean }>
  exportSuite: (suiteId: string) => Promise<{ success: boolean; path?: string; error?: string }>
  exportProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  importProject: () => Promise<{ success: boolean; error?: string }>
  importSuite: () => Promise<{ success: boolean; suite?: Suite; error?: string }>
  importTest: (suiteId: string) => Promise<{ success: boolean; test?: Test; error?: string }>

  // --- Saved logins (active project) ---
  /** The project's saved logins, without cookies or storage */
  listSavedLogins: () => Promise<SavedLoginsResult>
  forgetSavedLogin: (name: string) => Promise<{ ok: true } | { error: string }>

  // --- Test Management ---
  /** `test` is the test as saved, with its project file when it has one */
  saveRecording: (
    suiteId: string,
    testData: Test
  ) => Promise<{ success: boolean; error?: string; test?: Test }>
  deleteTest: (suiteId: string, testId: string) => Promise<void>
  exportTest: (
    testName: string,
    steps: Step[]
  ) => Promise<{ success: boolean; path?: string; error?: string }>

  // --- Recording Session ---
  startRecordingMain: () => Promise<{
    success: boolean
    url: string
    preloadPath: string
    /** The address isn't an http(s) website the recorder can open */
    reason?: 'unsupportedUrl'
  }>
  replayStepsAndRecord: (
    testName: string,
    stepsToReplay: Step[],
    rubyCommand: string
  ) => Promise<{
    success: boolean
    url?: string
    preloadPath?: string
    error?: string
    cancelled?: boolean
  }>
  cancelReplay: () => Promise<{ success: boolean }>
  replayInWebview: (steps: Step[]) => Promise<{
    success: boolean
    error?: string
    failedStepId?: string
    cancelled?: boolean
    skippedStepIds?: string[]
  }>
  registerRecorderWebContents: (webContentsId: number) => Promise<void>
  stopRecordingMain: () => Promise<CommandType>
  /** Tells main whether a recording is open, so closing the window saves it first */
  setRecordingState: (active: boolean) => void
  /** Main asks the page to save its recording before the window closes; returns an unsubscribe */
  onFlushRecording: (callback: () => void) => () => void
  flushRecordingDone: () => void
  loadUrlRequest: (url: string) => Promise<CommandType>
  updateRecordingSettings: (
    settings: Partial<{ implicitWait: number; explicitWait: number; selectorPriority: string[] }>
  ) => Promise<{ success: boolean; error?: string }>
  setActiveProject: (projectPath: string | null) => Promise<{
    success: boolean
    settings?: RecorderSettings
    layout?: ProjectLayout
    error?: string
  }>
  getRecorderSettings: () => Promise<RecorderSettings>

  // --- Trace Management ---
  saveTrace: (testId: string, trace: TraceStep[]) => Promise<{ success: boolean; error?: string }>
  loadTrace: (testId: string) => Promise<{ success: boolean; trace?: TraceStep[] }>
  deleteTrace: (testId: string) => Promise<void>

  // --- Event Listeners ---
  /** Sent once when opening a project moved (or could not yet move) its recorded tests into project files */
  onTestsMigrated: (
    callback: (event: IpcRendererEvent, info: { migrated: number; postponed: boolean }) => void
  ) => Electron.IpcRenderer
  removeTestsMigratedListener: (
    callback: (event: IpcRendererEvent, info: { migrated: number; postponed: boolean }) => void
  ) => Electron.IpcRenderer
  /** Sent when the project's suites were saved by a newer Raider and are left untouched */
  onSuitesTooNew: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer
  removeSuitesTooNewListener: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer

  // --- Scaffolding ---
  scaffoldGenerate: (
    params: Record<string, unknown>,
    projectPath: string,
    rubyCommand: string
  ) => Promise<{ success: boolean; output: string; error?: string }>

  // --- Extended Project Settings ---
  updateTimeout: (projectPath: string, seconds: number) => Promise<CommandType>
  updateViewport: (projectPath: string, width: number, height: number) => Promise<CommandType>
  updateBrowserOptions: (projectPath: string, options: string[]) => Promise<CommandType>
  updateHeadlessMode: (
    projectPath: string,
    enabled: boolean
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  getProjectConfig: (projectPath: string) => Promise<{
    success: boolean
    config?: {
      baseUrl?: string
      browser?: string
      headless?: boolean
      timeout?: number
      browserArguments?: string[]
    }
    error?: string
  }>

  // --- Path Configuration ---
  updatePaths: (projectPath: string, pathValue: string, pathType?: string) => Promise<CommandType>

  // --- Longship Integration ---
  getLongshipConfig: () => Promise<{
    url: string
    apiKey: string
    enabled: boolean
  }>
  setLongshipConfig: (config: {
    url?: string
    apiKey?: string
    enabled?: boolean
  }) => Promise<{ url: string; apiKey: string; enabled: boolean }>

  // --- Terminal ---
  terminalSpawn: (cwd: string, cols: number, rows: number) => Promise<void>
  terminalWrite: (data: string) => Promise<void>
  terminalResize: (cols: number, rows: number) => Promise<void>
  terminalKill: () => Promise<void>
  onTerminalData: (
    callback: (event: IpcRendererEvent, data: string) => void
  ) => Electron.IpcRenderer
  removeTerminalDataListener: (
    callback: (event: IpcRendererEvent, data: string) => void
  ) => Electron.IpcRenderer
  onTerminalExit: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer
  removeTerminalExitListener: (callback: (event: IpcRendererEvent) => void) => Electron.IpcRenderer

  // --- App Lifecycle ---
  closeApp: () => Promise<void>
}
