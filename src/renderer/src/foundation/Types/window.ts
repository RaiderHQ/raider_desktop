import type { DocsLinkId } from '@shared/docsLinkIds'
import type { FileNode } from '@shared/types/fileNode'
import type { CommandType } from '@shared/types/commandType'
import type { Test } from '@shared/types/test'
import type { TraceStep } from '@shared/types/traceStep'
import type { Step } from '@shared/types/step'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type { UpgradeResult } from '@shared/types/upgradeResult'
import type { RecentProjectEntry } from '@shared/types/recentProject'
import type { PickResult } from '@shared/types/pick'
import type {
  LegacyRunResult,
  PrepareTestRunResult
} from '@shared/types/prepareRun'
import type { CodeTestView, ProjectTestEntry } from '@shared/types/projectTest'
import type { ProjectFileResult } from '@shared/types/projectFiles'
import type { ScaffoldParams, ScaffoldResult } from '@shared/types/scaffoldTypes'
import type { QuickProject } from '@shared/types/quickProject'
import type { RunApi } from '@shared/types/runEvents'
import type { AssertionMessage } from '@shared/types/pendingAssertion'
import type { FailedStepMap, FailedStepQuery } from '@shared/types/failedStep'
import type { SavedLoginsResult } from '@shared/types/savedLogins'
import type { AcceptBaselineResult } from '@shared/types/acceptBaseline'
import type {
  TraceEntryResult,
  TraceOpenResult,
  ResultTraceSource
} from '@shared/types/raiderTrace'

/** Live-run methods (startRun, cancelRun, getActiveRun, getRunDefaults, onRunEvent) come from RunApi. */
export interface WindowApi extends RunApi {
  // --- Project Management ---
  runRubyRaider: (
    folderPath: string,
    projectName: string,
    automation: string,
    rubyCommand: string,
    options?: ProjectCreationOptions
  ) => Promise<CommandType>
  createQuickProject: (
    url: string,
    rubyCommand: string
  ) => Promise<{ success: true; projectPath: string } | { success: false; error: string }>
  isQuickProject: (projectPath: string) => Promise<boolean>
  /** Quick record projects in Raider's own folder, newest first */
  listQuickProjects: () => Promise<QuickProject[]>
  /** Projects opened with Raider on this computer, newest first (U8) */
  listRecentProjects: () => Promise<RecentProjectEntry[]>
  removeRecentProject: (projectPath: string) => Promise<RecentProjectEntry[]>
  clearRecentProjects: () => Promise<RecentProjectEntry[]>
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
  /**
   * Files tab context menu: `projectPath` is the project the renderer works on (refused when
   * another one is open); paths are project-relative POSIX, '' is the project root
   */
  createProjectEntry: (
    projectPath: string,
    parentRel: string,
    name: string,
    kind: 'file' | 'folder'
  ) => Promise<ProjectFileResult>
  copyProjectEntry: (
    projectPath: string,
    srcRel: string,
    destParentRel: string
  ) => Promise<ProjectFileResult>
  duplicateProjectEntry: (projectPath: string, rel: string) => Promise<ProjectFileResult>
  renameProjectEntry: (projectPath: string, rel: string, name: string) => Promise<ProjectFileResult>
  trashProjectEntry: (projectPath: string, rel: string) => Promise<ProjectFileResult>
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

  // --- Browser Configuration ---
  updateBrowserUrl: (
    projectPath: string,
    url: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  updateBrowserType: (
    projectPath: string,
    browser: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>

  // --- Test Execution ---
  runCommand: (command: string) => Promise<CommandType>
  /** `test`, when given, is saved before it runs, so the run never lags behind the editor */
  runTest: (
    testId: string,
    projectPath: string,
    rubyCommand: string,
    test?: Test
  ) => Promise<LegacyRunResult>
  /** Saves `test` when needed and returns the spec file to run live; runs nothing */
  prepareTestRun: (projectPath: string, testId: string, test?: Test) => Promise<PrepareTestRunResult>

  // --- Step Rendering ---
  /** Ruby for one step, in the active project's automation (Selenium or Watir). */
  renderStep: (step: Step) => Promise<string>

  /** The active project's recorded tests, with their steps; [] without a project */
  getTests: () => Promise<Test[]>
  /** Every spec file of the active project (recorded or hand-written); [] without a project */
  listProjectTests: () => Promise<ProjectTestEntry[]>
  /** Read-only view of a listed spec file; rejects for any other path */
  openCodeTest: (file: string) => Promise<CodeTestView>
  /** The recorded step a failed row's frames point into, or why there is none; never rejects */
  mapFailedStep: (
    projectPath: string,
    testId: string,
    failure: FailedStepQuery
  ) => Promise<FailedStepMap>
  getProjectLayout: () => Promise<ProjectLayout | null>
  upgradeRubyRaider: (projectPath: string, rubyCommand: string) => Promise<UpgradeResult>
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
  exportProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  importProject: () => Promise<{
    success: boolean
    error?: string
    imported?: number
    skipped?: number
    failed?: number
  }>
  setTestTags: (
    fileRel: string,
    tags: string[]
  ) => Promise<{ success: boolean; fileOnly?: boolean; error?: string }>
  importTest: () => Promise<{ success: boolean; test?: Test; error?: string }>

  // --- Saved logins (active project) ---
  /** The project's saved logins, without cookies or storage */
  listSavedLogins: () => Promise<SavedLoginsResult>
  forgetSavedLogin: (name: string) => Promise<{ ok: true } | { error: string }>

  // --- Test Management ---
  /** `test` is the test as saved, with its project file when it has one */
  saveRecording: (projectPath: string, testData: Test) => Promise<{ success: boolean; error?: string; test?: Test }>
  deleteTest: (
    testId: string
  ) => Promise<{ success: boolean; error?: string; codeOwned?: boolean }>
  /** The text of a spec file of the open project (`fileRel` is project-relative), for Copy */
  readTestFile: (
    projectPath: string,
    fileRel: string
  ) => Promise<{ success: true; text: string } | { success: false; error: string }>
  /** Writes `text` as a new `<base>_copy[_n]_spec.rb` (its first plain describe renamed to `name`); returns its project-relative path */
  pasteTestFile: (
    projectPath: string,
    payload: { text: string; sourceFile: string; nearFile?: string; name?: string }
  ) => Promise<
    { success: true; file: string; renamed: boolean } | { success: false; error: string }
  >
  /** Moves a spec file (and its record, if recorded) to the OS Trash; a recorded test's trace is deleted */
  trashTest: (
    projectPath: string,
    fileRel: string
  ) => Promise<
    { success: true; testId?: string; recordLeft?: true } | { success: false; error: string }
  >
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
  /** Tells main whether the open document has unsaved changes, so closing asks first */
  setDocumentEdited: (edited: boolean, name: string) => void
  /** Tells main whether a recording is open, so closing the window saves it first */
  setRecordingState: (active: boolean) => void
  /** Tells main only whether a recording is running, for the Record / Stop & save menu item */
  setMenuRecording: (recording: boolean) => void
  /** Main asks the page to save its recording before the window closes; returns an unsubscribe */
  onFlushRecording: (callback: () => void) => () => void
  flushRecordingDone: () => void
  /** Turns picking one element in the recorder on or off; fails when no recorder is open */
  setPickMode: (on: boolean, purpose?: 'repick' | 'assert') => Promise<{ success: boolean }>
  /** Called once when picking ends, with the element or a cancel; returns an unsubscribe */
  onRecorderPicked: (callback: (result: PickResult) => void) => () => void
  loadUrlRequest: (url: string) => Promise<CommandType>
  updateRecordingSettings: (
    settings: Partial<{ implicitWait: number; explicitWait: number; selectorPriority: string[]; testIdAttribute: string }>
  ) => Promise<{ success: boolean; error?: string }>
  setActiveProject: (projectPath: string | null) => Promise<{
    success: boolean
    settings?: RecorderSettings
    layout?: ProjectLayout
    error?: string
  }>
  getRecorderSettings: () => Promise<RecorderSettings>

  // --- Trace Management ---
  saveTrace: (
    testId: string,
    trace: TraceStep[],
    stepIds?: string[]
  ) => Promise<{ success: boolean; error?: string }>
  loadTrace: (testId: string) => Promise<{ success: boolean; trace?: TraceStep[] }>
  deleteTrace: (testId: string) => Promise<void>

  /** Copies a result screenshot over the project baseline after a native confirmation */
  acceptBaseline: (actualPath: string, baselinePath: string) => Promise<AcceptBaselineResult>
  // --- Trace viewer (raider-trace zips, held in main) ---
  /** A trace listed in run.json; it must sit in the active project's raider-results */
  openTrace: (source: ResultTraceSource) => Promise<TraceOpenResult>
  /** A trace file the user dropped on the window */
  openDroppedTrace: (file: File) => Promise<TraceOpenResult>
  /** One screenshot or snapshot, fetched lazily by the name the index gives */
  readTraceEntry: (traceId: string, name: string) => Promise<TraceEntryResult>
  closeTrace: (traceId: string) => Promise<void>
  /** Menu bar commands as plain strings; returns an unsubscribe function */
  onMenuCommand: (callback: (command: string) => void) => () => void
  onOpenRecentProject: (callback: (projectPath: string) => void) => () => void
  /** Traces opened from File → Open trace; returns an unsubscribe function */
  onTraceOpened: (callback: (result: TraceOpenResult) => void) => () => void

  // --- Main-to-renderer events (each returns an unsubscribe function) ---
  /** The recorded tests changed; carries them as main now has them */
  onTestsUpdated: (callback: (tests: Test[]) => void) => () => void
  onRecordingStarted: (callback: (loadedUrl: string) => void) => () => void
  onRecordingStopped: (callback: () => void) => () => void
  onNewRecordedStep: (callback: (step: Step) => void) => () => void
  onAddAssertionStep: (callback: (message: AssertionMessage) => void) => () => void
  onNewTraceStep: (callback: (traceStep: TraceStep) => void) => () => void
  onReplayFailed: (callback: (errorMsg: string) => void) => () => void

  // --- Scaffolding ---
  scaffoldGenerate: (
    params: ScaffoldParams,
    projectPath: string,
    rubyCommand: string
  ) => Promise<ScaffoldResult>

  // --- Extended Project Settings ---
  updateTimeout: (projectPath: string, seconds: number) => Promise<CommandType>
  updateViewport: (projectPath: string, width: number, height: number) => Promise<CommandType>
  updateBrowserOptions: (projectPath: string, options: string[]) => Promise<CommandType>
  updateHeadlessMode: (
    projectPath: string,
    enabled: boolean
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  openDocs: (id: DocsLinkId) => Promise<{ success: boolean }>
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
  onTerminalData: (callback: (data: string) => void) => () => void
  onTerminalExit: (callback: () => void) => () => void

  // --- App Lifecycle ---
  closeApp: () => Promise<void>
}
