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
    const command = `${rubyCommand} -S bundle install`

    const result = await safeExec(command, { cwd: normalizedPath, timeout: 120_000 })

    if (result.exitCode !== 0) {
      if (result.stderr.includes('permission denied')) {
        return {
          success: false,
          error: 'permission.denied',
          output: `sudo chown -R $(whoami) ${projectPath}`
        }
      }

      const stderr = result.stderr.trim()
      const stdout = result.stdout.trim()
      let errorMessage: string

      if (stderr || stdout) {
        errorMessage = stderr || stdout
      } else if (result.exitCode === null) {
        errorMessage = 'Bundle install timed out. Try running "bundle install" manually in the project directory.'
      } else {
        errorMessage = `Bundle install failed (exit code ${result.exitCode}). Try running "bundle install" manually in the project directory.`
      }

      return { success: false, error: errorMessage, output: stdout }
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
