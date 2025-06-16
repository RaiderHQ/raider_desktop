import { spawn } from 'child_process'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const runTests = async (_event: IpcMainInvokeEvent, folderPath: string) => {
  const fixPath = (await import('fix-path')).default // Dynamically import fix-path

  return new Promise((resolve) => {
    try {
      fixPath() // Call the imported fixPath function

      // Validate folderPath
      if (typeof folderPath !== 'string' || folderPath.trim() === '') {
        throw new Error('Invalid folderPath: Must be a non-empty string')
      }

      // Normalize folderPath
      const normalizedFolderPath = path.resolve(folderPath)

      // --- START: PATH MODIFICATION ---

      // 1. Get the original PATH from the environment
      const originalPath = process.env.PATH

      // 2. Find the path to your project's node_modules/.bin
      // Note: This path may need adjustment depending on your build output directory structure.
      // This assumes your running script is in `out/main/` relative to your project root.
      const nodeBinPath = path.resolve(__dirname, '..', '..', 'node_modules', '.bin')

      // 3. Create a new PATH string that filters out the local node_modules path
      const newPath = originalPath
        .split(path.delimiter)
        .filter((p) => path.resolve(p) !== nodeBinPath)
        .join(path.delimiter)

      // --- END: PATH MODIFICATION ---

      // Construct the Raider command for running tests
      const command = process.platform === 'win32' ? 'cmd.exe' : 'raider'
      const args = process.platform === 'win32' ? ['/c', 'raider', 'u', 'raid'] : ['u', 'raid']
      const options = {
        cwd: normalizedFolderPath, // Set the working directory to the project path
        shell: process.platform === 'win32', // Use shell only on Windows
        // 4. Pass the cleaned environment to the child process
        env: {
          ...process.env, // Inherit the rest of the environment
          PATH: newPath,   // Override the PATH with our new version
        },
      }

      // Spawn the Raider process
      const childProcess = spawn(command, args, options)

      let stdout = ''
      let stderr = ''

      // Listen for stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(`[STDOUT] runTests: ${data}`)
      })

      // Listen for stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(`[STDERR] runTests: ${data}`)
      })

      // Handle process exit
      childProcess.on('close', (code) => {
        // Even if tests fail, code might be non-zero. We'll check stderr.
        // Your logic might need to be more nuanced based on raider's exit codes.
        if (code === 0 || (code !== 0 && !stderr.includes('compatible'))) {
          console.log(`[SUCCESS] runTests: ${stdout}`)
          resolve({ success: true, output: stdout.trim() })
        } else {
          console.error(`[ERROR] runTests: ${stderr}`)
          resolve({ success: false, error: stderr.trim() })
        }
      })
    } catch (error) {
      console.error('Error running tests:', error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

export default runTests
