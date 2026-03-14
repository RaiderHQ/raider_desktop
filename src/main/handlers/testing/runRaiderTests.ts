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
  parallel?: boolean
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
    const commandToExecute = `${rubyCommand} -S bundle exec raider u raid${parallel ? ' -p' : ''}`

    const result = await safeExec(commandToExecute, {
      cwd: normalizedFolderPath,
      timeout: 120_000
    })

    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()

    // A non-zero exit code with test output means tests ran but some failed —
    // that's normal. Only treat it as an error if there's no test output.
    if (result.exitCode !== 0 && !stdout) {
      const errorMessage = stderr || 'Test execution failed with no output.'
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
