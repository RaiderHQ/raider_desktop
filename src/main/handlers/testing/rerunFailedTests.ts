import path from 'path'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import { safeExec } from '../../utils/safeExec'
import checkBundle from '../ruby/checkBundle'
import bundleInstall from '../ruby/bundleInstall'

const handler = async (
  mainWindow: BrowserWindow,
  folderPath: string,
  rubyCommand: string
): Promise<CommandType> => {
  try {
    const normalizedFolderPath = path.resolve(folderPath)

    // Detect framework by checking for spec/ or features/ directories
    const hasSpec = existsSync(path.join(normalizedFolderPath, 'spec'))
    const hasFeatures = existsSync(path.join(normalizedFolderPath, 'features'))

    if (!hasSpec && !hasFeatures) {
      return {
        success: false,
        output: '',
        error: 'Could not detect test framework. No spec/ or features/ directory found.'
      }
    }

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

    let commandToExecute: string

    if (hasSpec) {
      // RSpec: use --only-failures flag
      commandToExecute = `${rubyCommand} -S bundle exec rspec --only-failures`
    } else {
      // Cucumber: re-run from rerun.txt if it exists
      const rerunFile = path.join(normalizedFolderPath, 'rerun.txt')
      if (existsSync(rerunFile)) {
        commandToExecute = `${rubyCommand} -S bundle exec cucumber @rerun.txt`
      } else {
        return {
          success: false,
          output: '',
          error: 'No rerun.txt found. Run tests first to generate failure data.'
        }
      }
    }

    const result = await safeExec(commandToExecute, {
      cwd: normalizedFolderPath,
      timeout: 120_000
    })

    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()

    // A non-zero exit code with test output means tests ran but some failed —
    // that's expected for a re-run. Only treat it as an error if there's no
    // test output (e.g. a crash or config issue).
    if (result.exitCode !== 0 && !stdout) {
      const errorMessage = stderr || 'Re-run failed with no output.'
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
