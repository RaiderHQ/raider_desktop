import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { CommandType } from '@foundation/Types/commandType'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import { safeLog, safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  projectName: string,
  framework: string,
  automation: string,
  rubyCommand: string,
  mobile: string | null = null,
  options?: ProjectCreationOptions
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    // Validate inputs
    if (typeof folderPath !== 'string' || folderPath.trim() === '') {
      throw new Error('Invalid folderPath: Must be a non-empty string')
    }
    if (typeof projectName !== 'string' || projectName.trim() === '') {
      throw new Error('Invalid projectName: Must be a non-empty string')
    }
    if (typeof framework !== 'string' || framework.trim() === '') {
      throw new Error('Invalid framework: Must be a non-empty string')
    }
    if (typeof automation !== 'string' || automation.trim() === '') {
      throw new Error('Invalid automation: Must be a non-empty string')
    }
    if (typeof rubyCommand !== 'string' || rubyCommand.trim() === '') {
      throw new Error('Invalid rubyCommand: A command to set the Ruby environment is required.')
    }
    if (mobile !== null && typeof mobile !== 'string') {
      throw new Error('Invalid mobile parameter: Must be a string if provided')
    }

    const normalizedFolderPath = path.resolve(folderPath)
    const formattedFramework = framework.toLowerCase()
    let formattedAutomation = automation.toLowerCase()

    if (typeof mobile === 'string' && mobile.trim() !== '') {
      formattedAutomation = mobile.toLowerCase()
    }

    let raiderCommand = `raider new "${projectName}" -p framework:${formattedFramework} automation:${formattedAutomation}`

    if (options) {
      if (options.accessibility) raiderCommand += ' --accessibility'
      if (options.reporter && options.reporter !== 'none') {
        raiderCommand += ` -r ${options.reporter}`
      }
      if (options.skipCi) raiderCommand += ' --skip_ci'
      if (options.skipAllure) raiderCommand += ' --skip_allure'
      if (options.rubyVersion) raiderCommand += ` --ruby_version ${options.rubyVersion}`
    }

    // Extract the Ruby version from rubyCommand (e.g. "eval ... && rbenv shell 3.4.1 && ruby")
    // so buildShellCommand can pin RBENV_VERSION. This ensures raider is found even in
    // directories without a .ruby-version file.
    const versionMatch = rubyCommand.match(/rbenv shell ([\d.]+)/)
    const rubyVersionForShell = versionMatch ? versionMatch[1] : undefined

    const commandToExecute = buildShellCommand(normalizedFolderPath, raiderCommand, rubyVersionForShell)
    safeLog('[runRubyRaider] Executing:', commandToExecute)

    const result = await safeExec(commandToExecute, {
      timeout: 120_000
    })

    // Thor-based CLIs may exit with code 0 even on errors, so also check stderr
    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()

    if (result.exitCode !== 0 || (stderr && stdout.length === 0)) {
      let errorMessage: string

      if (stderr || stdout) {
        errorMessage = stderr || stdout
      } else if (result.exitCode === null) {
        errorMessage = 'Project creation timed out. Try running "raider new" manually in the terminal.'
      } else {
        errorMessage = `Project creation failed (exit code ${result.exitCode}). Try running "raider new" manually in the terminal.`
      }

      safeError('[runRubyRaider] Failed:', errorMessage)
      return { success: false, error: errorMessage, output: stdout }
    }
    // Verify the project directory was actually created
    const expectedProjectPath = path.join(normalizedFolderPath, projectName)
    if (!fs.existsSync(expectedProjectPath)) {
      safeError('[runRubyRaider] Command succeeded but project directory not found at:', expectedProjectPath)
      safeError('[runRubyRaider] stdout:', stdout)
      return {
        success: false,
        output: stdout,
        error: `Command completed but project directory was not created at "${expectedProjectPath}". Output: ${stdout || '(none)'}`
      }
    }

    safeLog('[runRubyRaider] Success:', stdout.slice(0, 200))
    return { success: true, output: stdout }
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export default handler
