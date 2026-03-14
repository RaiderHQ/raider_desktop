import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeExec } from '../../utils/safeExec'
import { safeWarn } from '../../utils/safeLog'
import { appState, getRecordingSettings } from '../appState'
import { generateTestCode } from '../frameworkTemplates'

export default async (
  suiteId: string,
  rubyCommand: string
): Promise<{ success: boolean; output: string }> => {
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, output: `Suite with ID ${suiteId} not found.` }
  }

  const { implicitWait, explicitWait } = getRecordingSettings()
  const framework = appState.projectFramework || null
  const automation = appState.projectAutomation || null
  const ext = framework === 'cucumber' ? 'feature' : 'rb'
  const tempFilePaths: string[] = []

  try {
    for (const test of suite.tests) {
      const testCode = generateTestCode(framework, {
        testName: test.name,
        steps: test.steps,
        implicitWait,
        explicitWait,
        automation
      })
      const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}_${Math.random()}.${ext}`)
      await fs.writeFile(tempFilePath, testCode)
      tempFilePaths.push(tempFilePath)
    }

    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    // For suites, join all temp file paths into one command
    const command =
      framework === 'minitest'
        ? tempFilePaths.map((f) => `${rubyCommand} ${f}`).join(' && ')
        : `${rubyCommand} -S rspec ${tempFilePaths.join(' ')} --format json`

    const result = await safeExec(command, { env: executionEnv, timeout: 120_000 })

    if (result.stdout) {
      return { success: true, output: result.stdout }
    } else {
      return { success: false, output: result.stderr }
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, output: errorMessage }
  } finally {
    for (const tempFilePath of tempFilePaths) {
      try {
        await fs.unlink(tempFilePath)
      } catch (cleanupError) {
        safeWarn(`Could not clean up temp file: ${cleanupError}`)
      }
    }
  }
}
