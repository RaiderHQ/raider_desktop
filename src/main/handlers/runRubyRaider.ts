import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import { ShellExecutor } from '../shell/ShellExecutor'

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  projectName: string,
  framework: string,
  automation: string,
  rubyCommand: string,
  mobile: string | null = null
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  return new Promise((resolve) => {
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

      const commandToExecute = `${rubyCommand} -S raider new "${projectName}" -p framework:${formattedFramework} automation:${formattedAutomation}`

      // Use ShellExecutor for cross-platform command execution
      const executor = ShellExecutor.create()
      executor
        .execute(commandToExecute, { cwd: normalizedFolderPath })
        .then((result) => {
          if (result.success) {
            resolve({ success: true, output: result.output })
          } else {
            const errorMessage = `Error: ${result.error || 'Unknown error'}\n--- OUTPUT ---\n${result.output}`
            resolve({ success: false, error: errorMessage, output: result.output })
          }
        })
        .catch((err) => {
          resolve({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            output: ''
          })
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
