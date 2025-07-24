import type { FileNode } from '@foundation/Types/fileNode'
import type { CommandType } from '@foundation/Types/commandType'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'

export interface WindowApi {
  runRubyRaider: (
    folderPath: string,
    projectName: string,
    framework: string,
    automation: string,
    mobile?: string | null
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
  openAllure: () => Promise<{ success: boolean; output?: string; error?: string }>
  runTests: (folderPath: string) => Promise<{ success: boolean; output?: string; error?: string }>
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
  runCommand: (command: string) => Promise<CommandType>
  installRaider: () => Promise<CommandType>
  isRubyInstalled: (
    projectPath: string
  ) => Promise<{ success: boolean; rubyVersion?: string; error?: string }>
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
  getSuites: () => Promise<Suite[]>
  createSuite: (suiteName: string) => Promise<{ success: boolean; suite?: Suite; error?: string }>
  deleteSuite: (suiteId: string) => Promise<{ success: boolean }>
  runSuite: (suiteId: string) => Promise<{ success: boolean; output: string }>
  exportSuite: (suiteId: string) => Promise<{ success: boolean; path?: string; error?: string }>
  exportProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  importProject: () => Promise<{ success: boolean; error?: string }>
  importSuite: () => Promise<{ success: boolean; suite?: Suite; error?: string }>
  importTest: (suiteId: string) => Promise<{ success: boolean; test?: Test; error?: string }>
  saveRecording: (suiteId: string, testData: Test) => Promise<{ success: boolean; error?: string }>
  deleteTest: (suiteId: string, testId: string) => Promise<void>
  startRecordingMain: () => Promise<CommandType>
  stopRecordingMain: () => Promise<CommandType>
  loadUrlRequest: (url: string) => Promise<CommandType>
  commandParser: (command: string) => Promise<string>
  exportTest: (
    testName: string,
    steps: string[]
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  runTest: (suiteId: string, testId: string) => Promise<{ success: boolean; output: string }>
  updateRecordingSettings: (settings: {
    implicitWait: number
  }) => Promise<{ success: boolean; error?: string }>
}
