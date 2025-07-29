import { exec } from 'child_process'
import path from 'path'
import { CommandType } from '@foundation/Types/commandType'

const handler = async (projectPath: string, rubyCommand: string): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  return new Promise((resolve) => {
    try {
      if (typeof projectPath !== 'string' || projectPath.trim() === '') {
        throw new Error('Invalid projectPath: Must be a non-empty string')
      }
      if (typeof rubyCommand !== 'string' || rubyCommand.trim() === '') {
        throw new Error('Invalid rubyCommand: A command to set the Ruby environment is required.')
      }

      const normalizedPath = path.resolve(projectPath)
      const command = `${rubyCommand} -S bundle check`

      exec(command, { cwd: normalizedPath }, (error, stdout, stderr) => {
        if (error) {
          // 'bundle check' returns a non-zero exit code if gems are missing.
          // This is an expected failure, not a critical error.
          resolve({ success: false, error: stderr.trim(), output: stdout.trim() })
          return
        }
        resolve({ success: true, output: stdout.trim() })
      })
    } catch (e) {
      resolve({
        success: false,
        output: '',
        error: e instanceof Error ? e.message : String(e)
      })
    }
  })
}

export default handler
