import { IpcMainInvokeEvent } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { CommandType, CommandOptions } from '@foundation/Types/commandType'

// Cross-platform runCommand
export const runCommand = (
  command: string,
  args: string[],
  options: CommandOptions
): Promise<CommandType> => {
  return new Promise<CommandType>((resolve) => {
    const platformCommand = process.platform === 'win32' ? 'cmd.exe' : command
    const platformArgs = process.platform === 'win32' ? ['/c', command, ...args] : args

    const spawnedProcess = spawn(platformCommand, platformArgs, options) // Rename local process variable to spawnedProcess
    let stdout = ''
    let stderr = ''

    spawnedProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    spawnedProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    spawnedProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() })
      } else {
        resolve({ success: false, output: stderr.trim(), error: stderr.trim() })
      }
    })
  })
}

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  projectName: string,
  framework: string,
  automation: string,
  mobile: string | null = null
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  try {
    fixPath() // Ensure the PATH is set correctly

    // Validate inputs
    if (typeof folderPath !== 'string') {
      throw new Error('Invalid folderPath: Must be a string')
    }
    if (typeof projectName !== 'string') {
      throw new Error('Invalid projectName: Must be a string')
    }
    if (typeof framework !== 'string' || typeof automation !== 'string') {
      throw new Error('Invalid framework or automation: Both must be strings')
    }
    if (mobile !== null && typeof mobile !== 'string') {
      throw new Error('Invalid mobile parameter: Must be a string if provided')
    }

    // Normalize folderPath using path.join
    const normalizedFolderPath = path.join(folderPath)

    // Convert parameters to lowercase
    const formattedFramework = framework.toLowerCase()
    let formattedAutomation = automation.toLowerCase()

    // Override formattedAutomation with mobile if mobile is provided
    if (typeof mobile === 'string') {
      formattedAutomation = mobile.toLowerCase() // Ensure only 'ios' or 'android' is set
    }

    // Construct the Raider command with additional parameters
    const command = 'raider'
    const args = [
      'new',
      projectName,
      '-p',
      `framework:${formattedFramework}`,
      `automation:${formattedAutomation}`
    ]
    const options = {
      cwd: normalizedFolderPath.trim(), // Ensure the working directory is set to the normalized project folder
      shell: process.platform === 'win32' // Use shell for Windows
    }

    // Execute Raider command
    const raiderProcess = await runCommand(command, args, options)

    if (raiderProcess.success) {
      console.log(`[SUCCESS] handler: ${raiderProcess.output}`)
      return { success: true, output: raiderProcess.output }
    }

    console.error(`[ERROR] handler: ${raiderProcess.error}`)
    return { success: false, output: '', error: raiderProcess.error }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export default handler
