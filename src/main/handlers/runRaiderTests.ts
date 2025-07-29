import { exec } from 'child_process'
import path from 'path'
import { BrowserWindow } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import checkBundle from './checkBundle'
import bundleInstall from './bundleInstall'
import checkWritePermissions from './checkWritePermissions'

const handler = async (
  mainWindow: BrowserWindow,
  folderPath: string,
  rubyCommand: string
): Promise<CommandType> => {
  try {
    const gemfileLockPath = path.join(folderPath, 'Gemfile.lock')
    const hasWritePermissions = await checkWritePermissions(gemfileLockPath)

    if (!hasWritePermissions) {
      return {
        success: false,
        output: '',
        error: `There was an error while trying to write to\n\`${gemfileLockPath}\`. It is likely that you need to\ngrant write permissions for that path.`
      }
    }
    // 1. Check if the bundle is up to date
    const checkResult = await checkBundle(folderPath, rubyCommand)

    if (!checkResult.success) {
      mainWindow.webContents.send('test-run-status', { status: 'installing' })
      // 2. If check fails, run bundle install
      const installResult = await bundleInstall(folderPath, rubyCommand)

      if (!installResult.success) {
        // If bundle install fails, return the error
        return {
          success: false,
          output: '',
          error: `Failed to install gems: ${installResult.error}`
        }
      }
    }

    // 3. Proceed with running the tests
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
