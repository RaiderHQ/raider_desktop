import { exec } from 'child_process'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { CommandType } from '@foundation/Types/commandType'

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

      const options = {
        cwd: normalizedFolderPath
      }

      exec(commandToExecute, options, (error, stdout, stderr) => {
        if (error) {
          const errorMessage = `Error: ${error.message}\n--- STDERR ---\n${stderr.trim()}\n--- STDOUT ---\n${stdout.trim()}`
          resolve({ success: false, error: errorMessage, output: stdout.trim() })
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
