import { contextBridge, ipcRenderer } from 'electron'
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
  selectFolder: async (title: string): Promise<string | null> => ipcRenderer.invoke('select-folder', title),
  readDirectory: async (folderPath: string): Promise<FileNode[]> => ipcRenderer.invoke('read-directory', folderPath),
  readFile: async (filePath: string): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => ipcRenderer.invoke('read-file', filePath),
  readImage: async (filePath: string): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => ipcRenderer.invoke('read-image', filePath),
  editFile: async (filePath: string, newContent: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('edit-file', filePath, newContent),
  openAllure: async (): Promise<{ success: boolean; output?: string; error?: string }> => ipcRenderer.invoke('open-allure'),
  runTests: async (folderPath: string): Promise<{ success: boolean; output?: string; error?: string }> => ipcRenderer.invoke('run-tests', folderPath),
  updateBrowserUrl: async (projectPath: string, url: string): Promise<{ success: boolean; output?: string; error?: string }> => ipcRenderer.invoke('update-browser-url', projectPath, url),
  updateBrowserType: async (projectPath: string, browser: string): Promise<{ success: boolean; output?: string; error?: string }> => ipcRenderer.invoke('update-browser-type', projectPath, browser),
  isMobileProject: async (projectPath: string): Promise<{ success: boolean; isMobileProject?: boolean; error?: string }> => ipcRenderer.invoke('is-mobile-project', projectPath),
  runCommand: async (command: string): Promise<CommandType> => ipcRenderer.invoke('run-command', command),
  installRaider: async (): Promise<CommandType> => ipcRenderer.invoke('install-raider'),
  isRubyInstalled: async (projectPath: string): Promise<{ success: boolean; rubyVersion?: string; error?: string }> => ipcRenderer.invoke('is-ruby-installed', projectPath),
  updateMobileCapabilities: async (projectPath: string, capabilities: { platformVersion: string; automationName: string; deviceName: string; app: string; }): Promise<{ success: boolean; output?: string; error?: string; }> => ipcRenderer.invoke('update-mobile-capabilities', projectPath, capabilities),
  getMobileCapabilities: async (projectPath: string): Promise<{ success: boolean; capabilities?: any; error?: string }> => ipcRenderer.invoke('get-mobile-capabilities', projectPath),

  // --- Recorder and Test Suite APIs ---

  // Suite Management
  getSuites: async (): Promise<Suite[]> => ipcRenderer.invoke('get-suites'),
  createSuite: async (suiteName: string): Promise<{ success: boolean, suite?: Suite, error?: string }> => ipcRenderer.invoke('create-suite', suiteName),
  deleteSuite: async (suiteId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('delete-suite', suiteId),
  runSuite: async (suiteId: string): Promise<{ success: boolean; output: string }> => ipcRenderer.invoke('run-suite', suiteId), // New API function

  // Test Management
  saveRecording: async (suiteId: string, testData: Test): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-recording', suiteId, testData),
  deleteTest: (suiteId: string, testId: string): Promise<void> =>
    ipcRenderer.invoke('delete-test', { suiteId, testId }),
  // Recording Session Control
  startRecordingMain: async (): Promise<CommandType> => ipcRenderer.invoke('start-recording-main'),
  stopRecordingMain: async (): Promise<CommandType> => ipcRenderer.invoke('stop-recording-main'),
  loadUrlRequest: async (url: string): Promise<CommandType> => ipcRenderer.invoke('load-url-request', url),
  commandParser: (command: string): Promise<string> =>
    ipcRenderer.invoke('command-parser', command),
  exportTest: (testName: string, steps: string[]): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export-test', { testName, steps }),
  runTest: async (suiteId: string, testId: string): Promise<{ success: boolean; output: string }> =>
    ipcRenderer.invoke('run-test', suiteId, testId),
  updateRecordingSettings: (settings: { implicitWait: number, explicitWait: number }) =>
    ipcRenderer.invoke('update-recording-settings', settings),
  getSelectorPriorities: (): Promise<string[]> =>
    ipcRenderer.invoke('get-selector-priorities'),
  saveSelectorPriorities: (priorities: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-selector-priorities', priorities)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Error exposing APIs:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
