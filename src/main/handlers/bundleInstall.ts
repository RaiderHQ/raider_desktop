import path from 'path'
import { CommandType } from '@foundation/Types/commandType'
import { ShellExecutor } from '../shell/ShellExecutor'
import { isWindows } from '../utils/platformDetection'

const handler = async (projectPath: string, rubyCommand: string): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    if (typeof projectPath !== 'string' || projectPath.trim() === '') {
      throw new Error('Invalid projectPath: Must be a non-empty string')
    }
    if (typeof rubyCommand !== 'string' || rubyCommand.trim() === '') {
      throw new Error('Invalid rubyCommand: A command to set the Ruby environment is required.')
    }

    const normalizedPath = path.resolve(projectPath)
    const command = `${rubyCommand} -S bundle install`

    // Use ShellExecutor for cross-platform command execution
    const executor = ShellExecutor.create()
    const result = await executor.execute(command, { cwd: normalizedPath })

    if (result.success) {
      return { success: true, output: result.output }
    } else {
      // Check for permission errors
      if (result.error && result.error.includes('permission denied')) {
        const fixCommand = isWindows()
          ? `icacls "${projectPath}" /grant:r ${process.env.USERNAME}:F /T`
          : `sudo chown -R $(whoami) ${projectPath}`
        return {
          success: false,
          error: 'permission.denied',
          output: fixCommand
        }
      } else {
        const errorMessage = `Error: ${result.error || 'Unknown error'}\n--- OUTPUT ---\n${result.output}`
        return { success: false, error: errorMessage, output: result.output }
      }
    }
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export default handler
