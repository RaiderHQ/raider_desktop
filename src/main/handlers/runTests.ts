import { spawn } from 'child_process'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const runTests = async (_event: IpcMainInvokeEvent, folderPath: string) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Call the imported fixPath function

      // Validate folderPath
      if (typeof folderPath !== 'string' || folderPath.trim() === '') {
        throw new Error('Invalid folderPath: Must be a non-empty string')
      }

      // Normalize folderPath
      const normalizedFolderPath = path.resolve(folderPath)

      // Construct the Raider command for running tests
      const command = process.platform === 'win32' ? 'cmd.exe' : 'raider'
      const args = process.platform === 'win32' ? ['/c', 'raider', 'u', 'raid'] : ['u', 'raid']
      const options = {
        cwd: normalizedFolderPath, // Set the working directory to the project path
        shell: process.platform === 'win32' // Use shell only on Windows
      }

      // Spawn the Raider process
      const childProcess = spawn(command, args, options)

      let stdout = ''
      let stderr = ''

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] runTests: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] runTests: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SUCCESS] runTests: ${stdout}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] runTests: ${stderr}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error running tests:', error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}

export default runTests
