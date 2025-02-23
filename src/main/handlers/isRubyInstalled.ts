import { IpcMainInvokeEvent } from 'electron'
import runCommand from './runCommand'
import { execSync } from 'child_process'

const isRubyInstalled = async (
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; rubyVersion?: string; error?: string }> => {
  try {
    // Manually load environment variables for production on macOS
    if (process.platform === 'darwin') {
      process.env.PATH = execSync('/usr/bin/env bash -l -c "echo $PATH"', { encoding: 'utf-8' }).trim()
    }

    // Determine which command to use
    const rubyPathCommand = process.platform === 'win32' ? 'where ruby' : 'which ruby'
    const rubyPathResult = await runCommand(_event, rubyPathCommand)

    if (!rubyPathResult.success) {
      return { success: false, error: 'Ruby is not installed or not found in PATH.' }
    }

    const rubyPath = rubyPathResult.output.trim()

    // Ignore system Ruby on macOS
    const isSystemRuby = process.platform === 'darwin' && rubyPath === '/usr/bin/ruby'
    if (isSystemRuby) {
      return {
        success: false,
        error: 'System Ruby detected, but a user-installed Ruby is required.'
      }
    }

    // Get Ruby version
    const rubyVersionResult = await runCommand(_event, `${rubyPath} -v`)
    if (!rubyVersionResult.success) {
      return { success: false, error: 'Failed to retrieve Ruby version.' }
    }

    const rubyVersion = rubyVersionResult.output.trim().split(' ')[1]
    return { success: true, rubyVersion }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export default isRubyInstalled
