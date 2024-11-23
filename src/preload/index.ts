import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { FileNode } from '@foundation/Types/fileNode'

// Custom APIs for renderer
const api = {
  runRubyRaider: async (
    projectName: string,
    folderPath: string
  ): Promise<{ success: boolean; output?: string; error?: string }> => {
    return ipcRenderer.invoke('run-ruby-raider', projectName, folderPath)
  },
  selectFolder: async (title: string): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder', title)
  },
  createSettingsFile: async (
    folderPath: string,
    data: object
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke('create-settings-file', folderPath, data)
  },
  readDirectory: async (folderPath: string): Promise<FileNode[]> => {
    return ipcRenderer.invoke('read-directory', folderPath)
  },
  readFile: async (filePath: string): Promise<string> => {
    return ipcRenderer.invoke('read-file', filePath)
  },
  checkConfig: async (
    folderPath: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke('check-config', folderPath)
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
