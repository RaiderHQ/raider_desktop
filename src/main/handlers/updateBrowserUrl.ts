const { spawn } = require('child_process')
const path = require('path')

const updateBrowserUrl = async (_event, projectPath, url) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Fix PATH for the environment

      // Validate inputs
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Invalid projectPath: Must be a non-empty string')
      }
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error('Invalid URL: Must be a non-empty string')
      }

      // Resolve the project folder path
      const normalizedProjectPath = path.resolve(projectPath)

      // Construct the Raider command
      const command = 'raider'
      const args = ['u', 'url', url]
      const options = {
        cwd: normalizedProjectPath, // Set the working directory to the project folder
        shell: process.env.SHELL // Use the system shell
      }

      // Spawn the command
      const childProcess = spawn(command, args, options)

      let stdout = ''
      let stderr = ''

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] updateBrowserUrl: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] updateBrowserUrl: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SUCCESS] updateBrowserUrl: ${stdout.trim()}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] updateBrowserUrl: ${stderr.trim()}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error updating browser URL:', error)
      resolve({ success: false, error: error.message })
    }
  })
}

export default updateBrowserUrl
