import path from 'path'
import { BrowserWindow } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import checkBundle from './checkBundle'
import bundleInstall from './bundleInstall'
import { ShellExecutor } from '../shell/ShellExecutor'

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

    // Use ShellExecutor for cross-platform command execution
    const executor = ShellExecutor.create()
    const result = await executor.execute(commandToExecute, { cwd: normalizedFolderPath })

    if (result.success) {
      return { success: true, output: result.output }
    } else {
      const errorMessage = `Test execution failed: ${result.error || 'Unknown error'}\n--- OUTPUT ---\n${result.output}`
      return { success: false, error: errorMessage, output: result.output }
    }
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
