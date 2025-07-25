import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { appState, getRecordingSettings } from './appState'
import { generateRspecCode } from './runRecording'

export default async (
  suiteId: string,
  projectPath: string,
  rubyCommand: string
): Promise<{ success: boolean; output: string }> => {
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, output: `Suite with ID ${suiteId} not found.` }
  }

  const { implicitWait, explicitWait } = getRecordingSettings()
  const tempFilePaths: string[] = []

  try {
    for (const test of suite.tests) {
      const testCode = generateRspecCode(test.name, test.steps, implicitWait, explicitWait)
      const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}_${Math.random()}.rb`)
      await fs.writeFile(tempFilePath, testCode)
      tempFilePaths.push(tempFilePath)
    }

    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }
    const command = `${rubyCommand} -S rspec ${tempFilePaths.join(' ')} --format json`

    return await new Promise((resolve) => {
      exec(command, { env: executionEnv }, (error, stdout, stderr) => {
        if (stdout) {
          resolve({ success: true, output: stdout })
        } else {
          resolve({ success: false, output: stderr })
        }
      })
    })
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, output: errorMessage }
  } finally {
    for (const tempFilePath of tempFilePaths) {
      try {
        await fs.unlink(tempFilePath)
      } catch (cleanupError) {
        console.warn(`Could not clean up temp file: ${cleanupError}`)
      }
    }
  }
}
