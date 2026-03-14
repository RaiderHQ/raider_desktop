import path from 'path'
import { BrowserWindow } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import { safeExec } from '../../utils/safeExec'
import checkBundle from '../ruby/checkBundle'
import bundleInstall from '../ruby/bundleInstall'

const handler = async (
  mainWindow: BrowserWindow,
  folderPath: string,
  rubyCommand: string,
  taskName: string
): Promise<CommandType> => {
  try {
    const checkResult = await checkBundle(folderPath, rubyCommand)

    if (!checkResult.success) {
      mainWindow.webContents.send('test-run-status', { status: 'installing' })
      const installResult = await bundleInstall(folderPath, rubyCommand)

      if (!installResult.success) {
        return {
          success: false,
          output: installResult.output || '',
          error: `Failed to install gems: ${installResult.error}`
        }
      }
    }

    mainWindow.webContents.send('test-run-status', { status: 'running' })
    const normalizedFolderPath = path.resolve(folderPath)
    const commandToExecute = `${rubyCommand} -S bundle exec rake ${taskName}`

    const result = await safeExec(commandToExecute, {
      cwd: normalizedFolderPath,
      timeout: 120_000
    })

    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()

    if (result.exitCode !== 0 && !stdout) {
      const errorMessage = stderr || 'Task execution failed with no output.'
      return { success: false, error: errorMessage, output: '' }
    }

    return { success: true, output: stdout }
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
