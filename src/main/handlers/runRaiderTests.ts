import { exec } from 'child_process'
import path from 'path'
import { BrowserWindow } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import checkBundle from './checkBundle'
import bundleInstall from './bundleInstall'

const handler = async (
  mainWindow: BrowserWindow,
  folderPath: string,
  rubyCommand: string
): Promise<CommandType> => {
  try {
    const checkResult = await checkBundle(folderPath, rubyCommand)

    if (!checkResult.success) {
      mainWindow.webContents.send('test-run-status', { status: 'installing' })
      const installResult = await bundleInstall(folderPath, rubyCommand)

      if (!installResult.success) {
        return {
          success: false,
          output: '',
          error: `Failed to install gems: ${installResult.error}`
        }
      }
    }

    mainWindow.webContents.send('test-run-status', { status: 'running' })
    const normalizedFolderPath = path.resolve(folderPath)
    const commandToExecute = `${rubyCommand} -S bundle exec raider u raid`

    return new Promise((resolve) => {
      exec(commandToExecute, { cwd: normalizedFolderPath }, (error, stdout, stderr) => {
        if (error) {
          const errorMessage = `Test execution failed: ${error.message}\n--- STDERR ---\n${stderr.trim()}\n--- STDOUT ---\n${stdout.trim()}`
          resolve({ success: false, error: errorMessage, output: stdout.trim() })
          return
        }
        resolve({ success: true, output: stdout.trim() })
      })
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      output: '',
      error: errorMessage
    }
  }
}

export default handler
