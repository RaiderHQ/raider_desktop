import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeExec } from '../../utils/safeExec'
import { generateTestCode, getTestRunCommand } from '../frameworkTemplates'

interface RunRecordingState {
  savedTest: { name: string; steps: string[] } | null
  implicitWait: number
  explicitWait: number
  projectPath: string
  rubyCommand: string
  projectAutomation?: string | null
  projectFramework?: string | null
}

/**
 * Generates the full Ruby RSpec code from an array of steps.
 * Kept for backward compatibility — delegates to generateTestCode with rspec defaults.
 */
export function generateRspecCode(
  testName: string,
  steps: string[],
  implicitWait: number,
  explicitWait: number
): string {
  return generateTestCode(null, {
    testName,
    steps,
    implicitWait,
    explicitWait,
    automation: null
  })
}

/**
 * Handles the 'run-test' IPC call. It generates a temporary test file
 * from the saved test, executes it, and returns the output.
 */
const runRecording = async (
  appState: RunRecordingState
): Promise<{ success: boolean; output: string }> => {
  if (!appState.savedTest) {
    return { success: false, output: 'No test has been saved to run.' }
  }

  const framework = appState.projectFramework || null
  const automation = appState.projectAutomation || null
  const ext = framework === 'cucumber' ? 'feature' : 'rb'
  const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}.${ext}`)

  try {
    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    const { name, steps } = appState.savedTest
    const { implicitWait, explicitWait, rubyCommand } = appState

    const testCode = generateTestCode(framework, {
      testName: name,
      steps,
      implicitWait,
      explicitWait,
      automation
    })

    await fs.writeFile(tempFilePath, testCode)

    const command = getTestRunCommand(framework, rubyCommand, tempFilePath)

    const result = await safeExec(command, { env: executionEnv, timeout: 120_000 })

    if (result.exitCode !== 0 && result.stderr) {
      const fullErrorOutput = `Test execution failed.\n\n--- STDERR ---\n${result.stderr}\n\n--- STDOUT ---\n${result.stdout}\n\n--- ERROR --- \n${result.stderr}`
      return { success: false, output: fullErrorOutput }
    }
    return { success: true, output: result.stdout }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, output: errorMessage }
  } finally {
    try {
      await fs.unlink(tempFilePath)
    } catch {
      // Deliberately empty
    }
  }
}

export default runRecording
