import { IpcMainInvokeEvent } from 'electron'
import runCommand from './runCommand'
import path from 'path'

interface RubyError {
  code: string
  params: { [key: string]: string }
}

const isRubyInstalled = async (
  _event: IpcMainInvokeEvent,
  projectPath: string
): Promise<{ success: boolean; rubyVersion?: string; error?: RubyError }> => {
  let debugInfo = ''
  try {
    // Normalize the project path.
    const normalizedPath = path.join(projectPath)
    let command: string

    if (process.platform === 'darwin') {
      // Determine the user's default shell.
      const userShell = process.env.SHELL || '/bin/bash'
      // Run the command in a login shell so that the user's environment is fully loaded.
      command = `${userShell} -l -c "cd '${normalizedPath}' && ruby -v"`

      // Set up some debug information.
      debugInfo = `
User Shell: ${userShell}
Platform: ${process.platform}
Normalized Path: ${normalizedPath}
Chosen Command: ${command}
      `.trim()
    } else {
      command = `cd '${normalizedPath}' && ruby -v`
    }

    const result = await runCommand(_event, command)
    if (!result.success) {
      return {
        success: false,
        error: {
          code: 'errors.ruby.commandFailed',
          params: {
            command,
            output: result.output,
            debugInfo
          }
        }
      }
    }

    const output = result.output.trim()
    const parts = output.split(' ')
    if (parts.length < 2) {
      return {
        success: false,
        error: {
          code: 'errors.ruby.unexpectedOutput',
          params: {
            output,
            debugInfo
          }
        }
      }
    }
    const version = parts[1]
    const majorVersion = parseInt(version.split('.')[0], 10)
    if (isNaN(majorVersion)) {
      return {
        success: false,
        error: {
          code: 'errors.ruby.failedToParse',
          params: {
            output,
            debugInfo
          }
        }
      }
    }

    if (majorVersion < 3) {
      return {
        success: false,
        rubyVersion: version,
        error: {
          code: 'errors.ruby.outdated',
          params: {
            version,
            output,
            debugInfo
          }
        }
      }
    }

    return { success: true, rubyVersion: version }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: {
        code: 'errors.ruby.unknown',
        params: {
          error: errorMessage,
          debugInfo
        }
      }
    }
  }
}

export default isRubyInstalled
