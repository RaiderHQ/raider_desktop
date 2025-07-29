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
      const command = `${rubyCommand} -S bundle install`

      const child = exec(command, { cwd: normalizedPath }, (error, stdout, stderr) => {
        if (error) {
          const errorMessage = `Error: ${error.message}\n--- STDERR ---\n${stderr.trim()}\n--- STDOUT ---\n${stdout.trim()}`
          resolve({ success: false, error: errorMessage, output: stdout.trim() })
          return
        }
        resolve({ success: true, output: stdout.trim() })
      })

      child.stdout?.on('data', () => {})

      child.stderr?.on('data', () => {})
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
