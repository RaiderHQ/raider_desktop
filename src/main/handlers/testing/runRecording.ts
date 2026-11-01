import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeExec } from '../../utils/safeExec'
import { quoteShellArg } from '../../utils/shellQuote'
import { generateRspecFile, toAutomation } from '../../codegen/testFile'
import { migrateLegacyTest } from '../../codegen/legacy'
import { mobileNoLegacyResult, type LegacyRunResult } from '../../../shared/types/prepareRun'

interface RunRecordingState {
  savedTest: { id: string; name: string; url: string; steps: unknown[] } | null
  implicitWait: number
  explicitWait: number
  browser?: string
  headless?: boolean
  projectPath: string
  rubyCommand: string
  projectAutomation?: string | null
  projectFramework?: string | null
}

/**
 * Handles the 'run-test' IPC call. It generates a temporary test file
 * from the saved test, executes it, and returns the output.
 */
const runRecording = async (
  appState: RunRecordingState
): Promise<LegacyRunResult> => {
  if (!appState.savedTest) {
    return { success: false, output: 'No test has been saved to run.' }
  }
  if (appState.projectAutomation === 'appium') return mobileNoLegacyResult()

  const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}.rb`)

  try {
    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    const { implicitWait, explicitWait, rubyCommand, browser, headless } = appState
    const test = migrateLegacyTest(appState.savedTest)

    const testCode = generateRspecFile(test, toAutomation(appState.projectAutomation ?? null), {
      browser: browser ?? 'chrome',
      headless: headless ?? false,
      implicitWait,
      explicitWait
    })

    await fs.writeFile(tempFilePath, testCode)

    const command = `${rubyCommand} -S rspec ${quoteShellArg(tempFilePath)} --format json`

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
