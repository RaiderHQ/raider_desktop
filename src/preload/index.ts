import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FileNode } from '@foundation/Types/fileNode'
import type { CommandType } from '@foundation/Types/commandType'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'

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
    mobile: string | null = null
  ): Promise<CommandType> => {
    return ipcRenderer.invoke(
      'run-ruby-raider',
      folderPath,
      projectName,
      framework,
      automation,
      mobile // Pass the optional mobile parameter to the main process
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
  openAllure: async (): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('open-allure'),
  runRaiderTests: async (
    folderPath: string,
    rubyCommand: string
  ): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('run-raider-tests', folderPath, rubyCommand),
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
  isMobileProject: async (
    projectPath: string
  ): Promise<{ success: boolean; isMobileProject?: boolean; error?: string }> =>
    ipcRenderer.invoke('is-mobile-project', projectPath),
  runCommand: async (command: string): Promise<CommandType> =>
    ipcRenderer.invoke('run-command', command),
  installRaider: async (): Promise<CommandType> => ipcRenderer.invoke('install-raider'),
  installGems: async (rubyCommand: string, gems: string[]): Promise<CommandType> =>
    ipcRenderer.invoke('install-gems', rubyCommand, gems),
  isRubyInstalled: async (): Promise<{
    success: boolean
    rubyVersion?: string
    error?: string
    missingGems?: string[]
    rubyCommand?: string
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
  updateMobileCapabilities: async (
    projectPath: string,
    capabilities: {
      platformVersion: string
      automationName: string
      deviceName: string
      app: string
    }
  ): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('update-mobile-capabilities', projectPath, capabilities),
  getMobileCapabilities: async (
    projectPath: string
  ): Promise<{ success: boolean; capabilities?: Record<string, unknown>; error?: string }> =>
    ipcRenderer.invoke('get-mobile-capabilities', projectPath),

  // --- Recorder and Test Suite APIs ---

  // Suite Management
  getSuites: async (): Promise<Suite[]> => ipcRenderer.invoke('get-suites'),
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
  ): Promise<{ success: boolean; output: string }> =>
    ipcRenderer.invoke('run-suite', suiteId, projectPath, rubyCommand),
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
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-recording', suiteId, testData),
  deleteTest: (suiteId: string, testId: string): Promise<void> =>
    ipcRenderer.invoke('delete-test', { suiteId, testId }),
  // Recording Session Control
  startRecordingMain: async (): Promise<CommandType> => ipcRenderer.invoke('start-recording-main'),
  stopRecordingMain: async (): Promise<CommandType> => ipcRenderer.invoke('stop-recording-main'),
  loadUrlRequest: async (url: string): Promise<CommandType> =>
    ipcRenderer.invoke('load-url-request', url),
  xpathParser: (command: string): Promise<string> => {
    return ipcRenderer.invoke('xpath-parser', command)
  },
  commandParser: (command: string): Promise<string> => {
    return ipcRenderer.invoke('command-parser', command)
  },
  exportTest: (
    testName: string,
    steps: string[]
  ): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export-test', { testName, steps }),
  runTest: async (
    suiteId: string,
    testId: string,
    projectPath: string,
    rubyCommand: string
  ): Promise<{ success: boolean; output: string }> =>
    ipcRenderer.invoke('run-test', suiteId, testId, projectPath, rubyCommand),
  updateRecordingSettings: (settings: {
    implicitWait: number
    explicitWait: number
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('update-recording-settings', settings),
  getSelectorPriorities: (): Promise<string[]> => ipcRenderer.invoke('get-selector-priorities'),
  saveSelectorPriorities: (priorities: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-selector-priorities', priorities),
  onTestRunStatus: (
    callback: (event: IpcRendererEvent, ...args: { status: string }[]) => void
  ): Electron.IpcRenderer => ipcRenderer.on('test-run-status', callback),
  removeTestRunStatusListener: (
    callback: (event: IpcRendererEvent, ...args: { status: string }[]) => void
  ): Electron.IpcRenderer => ipcRenderer.removeListener('test-run-status', callback)
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
