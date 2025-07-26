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
    // 1. Check if the bundle is up to date
    console.log('[runRaiderTests] Checking bundle status...')
    const checkResult = await checkBundle(folderPath, rubyCommand)

    if (!checkResult.success) {
      console.log(
        '[runRaiderTests] Bundle check failed. Dependencies are missing. Running bundle install...'
      )
      mainWindow.webContents.send('test-run-status', { status: 'installing' })
      // 2. If check fails, run bundle install
      const installResult = await bundleInstall(folderPath, rubyCommand)

      if (!installResult.success) {
        // If bundle install fails, return the error
        console.error('[runRaiderTests] Bundle install failed.')
        return {
          success: false,
          output: '',
          error: `Failed to install gems: ${installResult.error}`
        }
      }
      console.log('[runRaiderTests] Bundle install completed successfully.')
    } else {
      console.log('[runRaiderTests] Bundle check successful. Dependencies are up to date.')
    }

    // 3. Proceed with running the tests
    console.log('[runRaiderTests] Proceeding to run Raider tests...')
    mainWindow.webContents.send('test-run-status', { status: 'running' })
    const normalizedFolderPath = path.resolve(folderPath)
    const commandToExecute = `${rubyCommand} -S bundle exec raider u raid`

    return new Promise((resolve) => {
      exec(commandToExecute, { cwd: normalizedFolderPath }, (error, stdout, stderr) => {
        if (error) {
          const errorMessage = `Test execution failed: ${error.message}\n--- STDERR ---\n${stderr.trim()}\n--- STDOUT ---\n${stdout.trim()}`
          console.error(`[ERROR] runRaiderTests: ${errorMessage}`)
          resolve({ success: false, error: errorMessage, output: stdout.trim() })
          return
        }
        console.log(`[SUCCESS] runRaiderTests: ${stdout}`)
        resolve({ success: true, output: stdout.trim() })
      })
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[FATAL] runRaiderTests: An unexpected error occurred: ${errorMessage}`)
    return {
      success: false,
      output: '',
      error: errorMessage
    }
  }
}

export default handler
