import { spawn } from 'child_process'
import path from 'path'

const handler = async (): Promise<{ success: boolean; output?: string; error?: string }> => {
  const fixPath = (await import('fix-path')).default

  return new Promise((resolve) => {
    try {
      fixPath()

      const localDirectoryPath = process.cwd()

      if (typeof localDirectoryPath !== 'string' || localDirectoryPath.trim() === '') {
        throw new Error('Invalid local directory path: Must be a non-empty string')
      }

      const normalizedFolderPath = path.resolve(localDirectoryPath)

      const command = process.platform === 'win32' ? 'cmd.exe' : 'allure'
      const args =
        process.platform === 'win32'
          ? ['/c', 'allure', 'serve', 'allure-results']
          : ['serve', 'allure-results']
      const options = {
        cwd: normalizedFolderPath,
        shell: process.platform === 'win32'
      }

      const childProcess = spawn(command, args, options)

      if (childProcess.pid) {
        resolve({ success: true, output: `Allure server started with PID ${childProcess.pid}` })
      } else {
        resolve({ success: false, error: 'Failed to spawn Allure process' })
      }

      childProcess.on('error', (error) => {
        resolve({ success: false, error: error instanceof Error ? error.message : String(error) })
      })

      childProcess.stdout.on('data', (data) => {
        console.log(`[STDOUT] Allure: ${data.toString()}`)
      })
      childProcess.stderr.on('data', (data) => {
        console.error(`[STDERR] Allure: ${data.toString()}`)
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
