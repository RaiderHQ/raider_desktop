import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { exec } from 'child_process'

// Custom APIs for renderer
const api = {
  runRaiderCommand: (nameOfProject: string, framework: string, automationType: string) => {
    return new Promise((resolve, reject) => {
      // Properly format the raider command to avoid errors
      const command = `raider new ${nameOfProject} --framework ${framework} --automation ${automationType}`
      console.log('Executing command:', command) // Debugging log

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Command execution failed: ${stderr}`)
          reject(`Error: ${stderr}`)
        } else {
          console.log('Command executed successfully:', stdout)
          resolve(stdout)
        }
      })
    })
  },
  selectFolder: async (title: string): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder', title)
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
