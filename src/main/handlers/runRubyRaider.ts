import { spawn } from 'child_process'
import path from 'path'

const runCommand = (command: string, args: string[], options: any) => {
  return new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
    const process = spawn(command, args, options)
    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() })
      } else {
        resolve({ success: false, output: stderr.trim(), error: stderr.trim() })
      }
    })
  })
}

const handler = async (
  _event,
  folderPath: string,
  projectName: string,
  framework: string,
  automation: string,
  mobile: string | null = null
) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise(async (resolve) => {
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

      // Check if Ruby Raider is installed
      const rubyRaiderCheck = await runCommand('raider', ['v'], {
        shell: process.env.SHELL,
        cwd: normalizedFolderPath, // Ensure commands run in the selected folder
      })
      if (!rubyRaiderCheck.success) {
        console.warn('Ruby Raider is not installed. Attempting to install...')
        const installResult = await runCommand('gem', ['install', 'ruby_raider'], {
          shell: process.env.SHELL,
          cwd: normalizedFolderPath, // Install in the normalized folder path
        })
        if (!installResult.success) {
          alert(`Failed to install Ruby Raider: ${installResult.error}`)
          throw new Error(`Failed to install Ruby Raider: ${installResult.error}`)
        }
        console.log('Ruby Raider installed successfully.')
      }

      // Construct the Raider command with additional parameters
      const command = 'raider'
      const args = [
        'new',
        projectName,
        '-p',
        `framework:${formattedFramework}`,
        `automation:${formattedAutomation}`,
      ]
      const options = {
        cwd: normalizedFolderPath.trim(), // Ensure the working directory is set to the normalized project folder
        shell: process.env.SHELL,
      }

      // Execute Raider command
      const raiderProcess = await runCommand(command, args, options)

      if (raiderProcess.success) {
        console.log(`[SUCCESS] handler: ${raiderProcess.output}`)
        resolve({ success: true, output: raiderProcess.output })
      } else {
        console.error(`[ERROR] handler: ${raiderProcess.error}`)
        resolve({ success: false, error: raiderProcess.error })
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}

export default handler
