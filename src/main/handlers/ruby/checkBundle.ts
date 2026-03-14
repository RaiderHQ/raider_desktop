import path from 'path'
import { safeExec } from '../../utils/safeExec'
import { CommandType } from '@foundation/Types/commandType'

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

    const result = await safeExec(command, { cwd: normalizedPath, timeout: 30_000 })

    if (result.exitCode !== 0) {
      // 'bundle check' returns a non-zero exit code if gems are missing.
      // This is an expected failure, not a critical error.
      return { success: false, error: result.stderr.trim(), output: result.stdout.trim() }
    }
    return { success: true, output: result.stdout.trim() }
  } catch (e) {
    return {
      success: false,
      output: '',
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export default handler
