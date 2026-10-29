import { promises as fs } from 'fs'
import { exec } from 'child_process'
import os from 'os'
import path from 'path'
import { appState } from '../appState'
import startRecordingMain from './startRecordingMain'
import { generateRspecFile, toAutomation } from '../../codegen/testFile'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import type { Step } from '../../../shared/types/step'

interface ReplayResult {
  success: boolean
  url?: string
  preloadPath?: string
  error?: string
  cancelled?: boolean
}

/**
 * Replays the given steps headlessly (without opening a visible browser),
 * captures the final URL, then hands off to startRecordingMain so the user
 * can continue recording from that page state.
 */
async function replayStepsAndRecord(
  _event: Electron.IpcMainInvokeEvent,
  _testName: string,
  stepsToReplay: Step[],
  rubyCommand: string
): Promise<ReplayResult> {
  if (!isValidRubyCommand(rubyCommand)) {
    return { success: false, error: 'The Ruby command is not valid, so the replay did not run.' }
  }
  const { implicitWait, explicitWait } = appState.recorderSettings
  const tempFilePath = path.join(os.tmpdir(), `replay_${Date.now()}_spec.rb`)

  // Replay headlessly in Chrome, then print the final URL for the recorder to resume from.
  const automation = toAutomation(appState.projectAutomation)
  const currentUrl = automation === 'watir' ? '@browser.url' : '@driver.current_url'
  const script = generateRspecFile(
    {
      name: 'replay',
      steps: [
        ...stepsToReplay,
        { id: 'replay-final-url', kind: 'custom', code: `puts "RAIDER_FINAL_URL:#{${currentUrl}}"` }
      ]
    },
    automation,
    { browser: 'chrome', headless: true, implicitWait, explicitWait }
  )

  try {
    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    await fs.writeFile(tempFilePath, script)

    const result = await new Promise<{
      stdout: string
      stderr: string
      exitCode: number | null
      cancelled?: boolean
    }>((resolve) => {
      const child = exec(
        `${rubyCommand} -S rspec ${tempFilePath}`,
        { env: executionEnv, timeout: 120_000, encoding: 'utf8' },
        (error, stdout, stderr) => {
          appState.activeReplayProcess = null
          if (error?.killed) {
            resolve({ stdout: stdout ?? '', stderr: '', exitCode: null, cancelled: true })
          } else if (error) {
            resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? error.message,
              exitCode: error.code ?? 1
            })
          } else {
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 })
          }
        }
      )
      appState.activeReplayProcess = child
    })

    if (result.cancelled) {
      return { success: false, cancelled: true }
    }

    if (result.exitCode !== 0) {
      const errorMsg = result.stdout.trim() || result.stderr || 'Replay failed'

      appState.mainWindow?.webContents.send('replay-failed', errorMsg)
      return { success: false, error: errorMsg }
    }

    const finalUrlLine = result.stdout.split('\n').find((l) => l.startsWith('RAIDER_FINAL_URL:'))
    const finalUrl = finalUrlLine
      ? finalUrlLine.replace('RAIDER_FINAL_URL:', '').trim()
      : (appState.sessionUrl ?? appState.recorderSettings.baseUrl)

    appState.sessionUrl = finalUrl

    const recordingResult = startRecordingMain()
    return {
      success: recordingResult.success,
      url: recordingResult.url,
      preloadPath: recordingResult.preloadPath
    }
  } catch (e: unknown) {
    appState.activeReplayProcess = null
    const errorMessage = e instanceof Error ? e.message : String(e)
    appState.mainWindow?.webContents.send('replay-failed', errorMessage)
    return { success: false, error: errorMessage }
  } finally {
    try {
      await fs.unlink(tempFilePath)
    } catch {
      // Deliberately empty
    }
  }
}

export default replayStepsAndRecord
