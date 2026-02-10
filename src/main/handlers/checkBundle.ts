import path from 'path'
import { CommandType } from '@foundation/Types/commandType'
import { ShellExecutor } from '../shell/ShellExecutor'

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
    const command = `${rubyCommand} -S bundle check`

    // Use ShellExecutor for cross-platform command execution
    const executor = ShellExecutor.create()
    const result = await executor.execute(command, { cwd: normalizedPath })

    if (result.success) {
      return { success: true, output: result.output }
    } else {
      // 'bundle check' returns a non-zero exit code if gems are missing.
      // This is an expected failure, not a critical error.
      return { success: false, error: result.error || '', output: result.output }
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
