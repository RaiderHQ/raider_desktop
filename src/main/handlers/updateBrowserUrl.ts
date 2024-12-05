import { spawn } from 'child_process'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const updateBrowserUrl = async (_event: IpcMainInvokeEvent, projectPath: string, url: string) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Fix PATH for the environment

      // Validate inputs
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: Must be a non-empty string')
      }
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error('Invalid URL: Must be a non-empty string')
      }

      // Resolve the project folder path
      const normalizedProjectPath = path.resolve(projectPath)

      // Construct the Raider command
      const command = process.platform === 'win32' ? 'cmd.exe' : 'raider'
      const args =
        process.platform === 'win32' ? ['/c', 'raider', 'u', 'url', url] : ['u', 'url', url]

      const options = {
        cwd: normalizedProjectPath, // Set the working directory to the project folder
        shell: process.platform === 'win32' // Use shell only on Windows
      }

      // Spawn the command
      const childProcess = spawn(command, args, options)

      let stdout = ''
      let stderr = ''

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] updateBrowserUrl: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] updateBrowserUrl: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SUCCESS] updateBrowserUrl: ${stdout.trim()}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] updateBrowserUrl: ${stderr.trim()}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error updating browser URL:', error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}

export default updateBrowserUrl
