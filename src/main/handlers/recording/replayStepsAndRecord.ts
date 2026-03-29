import { promises as fs } from 'fs'
import { exec } from 'child_process'
import os from 'os'
import path from 'path'
import { appState, getRecordingSettings } from '../appState'
import startRecordingMain from './startRecordingMain'

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
  stepsToReplay: string[],
  rubyCommand: string
): Promise<ReplayResult> {
  const { implicitWait, explicitWait } = getRecordingSettings()
  const tempFilePath = path.join(os.tmpdir(), `replay_${Date.now()}.rb`)

  const formattedSteps = stepsToReplay.map((step) => `  ${step}`).join('\n  sleep(1)\n')

  const script = `require 'selenium-webdriver'

opts = Selenium::WebDriver::Chrome::Options.new(args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'])
@driver = Selenium::WebDriver.for :chrome, options: opts
@driver.manage.timeouts.implicit_wait = ${implicitWait}
@wait = Selenium::WebDriver::Wait.new(timeout: ${explicitWait})
@vars = {}

begin
  ${formattedSteps}
  puts "RAIDER_FINAL_URL:\#{@driver.current_url}"
rescue => e
  puts "RAIDER_REPLAY_ERROR:\#{e.message}"
  exit 1
ensure
  @driver.quit
end
`

  try {
    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    await fs.writeFile(tempFilePath, script)

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null; cancelled?: boolean }>((resolve) => {
      const child = exec(
        `${rubyCommand} ${tempFilePath}`,
        { env: executionEnv, timeout: 120_000, encoding: 'utf8' },
        (error, stdout, stderr) => {
          appState.activeReplayProcess = null
          if (error?.killed) {
            resolve({ stdout: stdout ?? '', stderr: '', exitCode: null, cancelled: true })
          } else if (error) {
            resolve({ stdout: stdout ?? '', stderr: stderr ?? error.message, exitCode: error.code ?? 1 })
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
      const errorLine = result.stdout
        .split('\n')
        .find((l) => l.startsWith('RAIDER_REPLAY_ERROR:'))
      const errorMsg = errorLine
        ? errorLine.replace('RAIDER_REPLAY_ERROR:', '')
        : result.stderr || 'Replay failed'

      appState.mainWindow?.webContents.send('replay-failed', errorMsg)
      return { success: false, error: errorMsg }
    }

    const finalUrlLine = result.stdout
      .split('\n')
      .find((l) => l.startsWith('RAIDER_FINAL_URL:'))
    const finalUrl = finalUrlLine
      ? finalUrlLine.replace('RAIDER_FINAL_URL:', '').trim()
      : appState.projectBaseUrl

    appState.projectBaseUrl = finalUrl

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
