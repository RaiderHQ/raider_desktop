import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { exec } from 'child_process'

// Custom APIs for renderer
const api = {
  doesGemfileExist: () => {
    const gemfilePath = path.join(__dirname, 'Gemfile')
    return fs.existsSync(gemfilePath)
  },
  runRaiderCommand: (nameOfProject, framework, automationType) => {
    return new Promise((resolve, reject) => {
      const command = `raider new ${nameOfProject} p framework : ${framework} automation : ${automationType}`
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${stderr}`)
          reject(stderr)
        } else {
          resolve(stdout)
        }
      })
    })
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
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
