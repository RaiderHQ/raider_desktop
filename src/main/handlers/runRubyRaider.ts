const { spawn } = require('child_process')
const path = require('path')

const handler = async (_event, folderPath, projectName, framework, automation) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Call the imported fixPath function

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

      // Normalize folderPath using path.join
      const normalizedFolderPath = path.join(folderPath)

      // Convert parameters to lowercase
      const formattedFramework = framework.toLowerCase()
      const formattedAutomation = automation.toLowerCase()

      // Construct the Raider command with additional parameters
      const command = "raider"
      const args = [
        "new",
        projectName,
        "-p",
        `framework:${formattedFramework}`,
        `automation:${formattedAutomation}`
      ]
      const options = {
        cwd: normalizedFolderPath.trim(), // Ensure the working directory is set to the normalized project folder
        shell: process.env.SHELL
      }

      // Spawn the command
      const childProcess = spawn(command, args, options)

      let stdout = ""
      let stderr = ""

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] handler: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] handler: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SUCCESS] handler: ${stdout}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] handler: ${stderr}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error running Ruby Raider command:', error)
      resolve({ success: false, error: error.message })
    }
  })
}

export default handler
