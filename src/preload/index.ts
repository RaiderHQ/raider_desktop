import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { FileNode } from '@foundation/Types/fileNode'

// Custom APIs for renderer
const api = {
  runRubyRaider: async (folderPath, projectName, framework, automation, mobile = null) => {
    return ipcRenderer.invoke(
      'run-ruby-raider',
      folderPath,
      projectName,
      framework,
      automation,
      mobile // Pass the optional mobile parameter to the main process
    )
  },
  selectFolder: async (title: string): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder', title)
  },
  readDirectory: async (folderPath: string): Promise<FileNode[]> => {
    return ipcRenderer.invoke('read-directory', folderPath)
  },
  checkConfig: async (
    folderPath: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke('check-config', folderPath)
  },
  readFile: async (
    filePath: string
  ): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => {
    return ipcRenderer.invoke('read-file', filePath)
  },
  editFile: async (
    filePath: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('edit-file', filePath, newContent) // Invoke the edit-file handler in the main process
  },
  openAllure: async (folderPath: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    return ipcRenderer.invoke('open-allure', folderPath) // Pass folderPath to the main process
  },
  runTests: async (folderPath: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    return ipcRenderer.invoke('run-tests', folderPath) // Pass folderPath to the main process
  },
  updateBrowserUrl: async (
    projectPath: string,
    url: string
  ): Promise<{ success: boolean; output?: string; error?: string }> => {
    return ipcRenderer.invoke('update-browser-url', projectPath, url) // Invoke the update-browser-url handler
  },
  updateBrowserType: async (
    projectPath: string,
    browser: string
  ): Promise<{ success: boolean; output?: string; error?: string }> => {
    return ipcRenderer.invoke('update-browser-type', projectPath, browser) // Invoke the update-browser-type handler
  },
  isMobileProject: async (
    projectPath: string
  ): Promise<{ success: boolean; isMobileProject?: boolean; error?: string }> => {
    return ipcRenderer.invoke('is-mobile-project', projectPath) // Invoke the is-mobile-project handler
  }
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
