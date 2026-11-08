import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { quoteShellArg } from '../../utils/shellQuote'
import { CommandType } from '@foundation/Types/commandType'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import { isValidProjectName } from '@shared/projectName'
import { safeLog, safeError } from '../../utils/safeLog'

/** Anything at all at the path: a folder, a file, or a symlink (dangling or not). */
function entryExists(target: string): boolean {
  try {
    fs.lstatSync(target)
    return true
  } catch {
    return false
  }
}

/**
 * `raider new` failed part-way and left a folder the user never asked to keep. Only a
 * plain folder that was not there before the run is removed; a symlink or a file is
 * not ours to touch.
 */
function removeHalfMadeProject(target: string): void {
  try {
    const entry = fs.lstatSync(target)
    if (!entry.isDirectory() || entry.isSymbolicLink()) return
    fs.rmSync(target, { recursive: true, force: true })
  } catch (e) {
    safeError('[runRubyRaider] Could not remove the half-made project:', target, e)
  }
}

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  projectName: string,
  automation: string,
  rubyCommand: string,
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
    if (!isValidProjectName(projectName)) {
      throw new Error(
        'Invalid projectName: Use letters, numbers, underscores and hyphens, starting with a letter or number'
      )
    }
    // The desktop creates web projects only; mobile (Appium) is not supported in this version
    if (automation !== 'selenium') {
      throw new Error("Invalid automation: Only 'selenium' is supported")
    }
    if (typeof rubyCommand !== 'string' || rubyCommand.trim() === '') {
      throw new Error('Invalid rubyCommand: A command to set the Ruby environment is required.')
    }

    const normalizedFolderPath = path.resolve(folderPath)
    const expectedProjectPath = path.join(normalizedFolderPath, projectName)
    // Thor would ask "Overwrite?" on a clash and, with stdin closed, overwrite. Refuse first.
    if (entryExists(expectedProjectPath)) {
      return {
        success: false,
        output: '',
        error: `A folder named "${projectName}" already exists in ${normalizedFolderPath}.`
      }
    }
    let raiderCommand = `raider new ${quoteShellArg(projectName)} -p framework:rspec automation:selenium`

    // github is ruby_raider's default so nothing is passed for it
    if (options?.ci === 'azure') raiderCommand += ' ci:azure'

    if (options?.examples === false) raiderCommand += ' examples:false'

    if (options?.accessibility) raiderCommand += ' --accessibility'

    // Extract the Ruby version from rubyCommand (e.g. "eval ... && rbenv shell 3.4.1 && ruby")
    // so buildShellCommand can pin RBENV_VERSION. This ensures raider is found even in
    // directories without a .ruby-version file.
    const versionMatch = rubyCommand.match(/rbenv shell ([\d.]+)/)
    const rubyVersionForShell = versionMatch ? versionMatch[1] : undefined

    const commandToExecute = buildShellCommand(
      normalizedFolderPath,
      raiderCommand,
      rubyVersionForShell
    )
    safeLog('[runRubyRaider] Executing:', commandToExecute)

    const result = await safeExec(commandToExecute, {
      timeout: 120_000,
      closeStdin: true
    })

    // Thor-based CLIs may exit with code 0 even on errors, so also check stderr
    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()

    if (result.exitCode !== 0 || (stderr && stdout.length === 0)) {
      let errorMessage: string

      if (stderr || stdout) {
        errorMessage = stderr || stdout
      } else if (result.exitCode === null) {
        errorMessage =
          'Project creation timed out. Try running "raider new" manually in the terminal.'
      } else {
        errorMessage = `Project creation failed (exit code ${result.exitCode}). Try running "raider new" manually in the terminal.`
      }

      safeError('[runRubyRaider] Failed:', errorMessage)
      // Only after raider itself failed: after a timeout only the shell was killed and ruby
      // may still be writing; after exit 0 with stderr only, the folder may be a whole project
      if (result.exitCode !== null && result.exitCode !== 0)
        removeHalfMadeProject(expectedProjectPath)
      return { success: false, error: errorMessage, output: stdout }
    }
    // Verify the project directory was actually created
    if (!fs.existsSync(expectedProjectPath)) {
      safeError(
        '[runRubyRaider] Command succeeded but project directory not found at:',
        expectedProjectPath
      )
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
