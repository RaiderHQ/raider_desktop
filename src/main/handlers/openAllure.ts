import { spawn } from 'child_process'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const handler = async (_event: IpcMainInvokeEvent, folderPath: string) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Ensure the system PATH is correctly set

      // Validate the folderPath
      if (typeof folderPath !== 'string' || folderPath.trim() === '') {
        throw new Error('Invalid folderPath: Must be a non-empty string')
      }

      // Normalize the folder path
      const normalizedFolderPath = path.resolve(folderPath)

      // Define the command and arguments
      const command = process.platform === 'win32' ? 'cmd.exe' : 'allure'
      const args =
        process.platform === 'win32'
          ? ['/c', 'allure', 'serve', 'allure-results']
          : ['serve', 'allure-results']
      const options = {
        cwd: normalizedFolderPath, // Set the working directory to the project folder
        shell: process.platform === 'win32' // Use shell only for Windows
      }

      // Spawn the process
      const childProcess = spawn(command, args, options)

      let stdout = ''
      let stderr = ''

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] handler: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] handler: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SUCCESS] Allure server started: ${stdout}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] Failed to start Allure server: ${stderr}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error running Allure command:', error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}

export default handler
