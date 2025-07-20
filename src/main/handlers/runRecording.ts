import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

interface AppState {
  savedTest: { name: string; steps: string[] } | null
}

/**
 * Generates the full Ruby RSpec code from an array of steps.
 * @param testName The name for the 'describe' block in RSpec.
 * @param steps The array of command strings.
 */
function generateRspecCode(testName: string, steps: string[]): string {
  const formattedSteps = steps
    .map((step) => `    ${step}`)
    .join('\n    sleep(1)\n')
  return `
require 'selenium-webdriver'
require 'rspec'

describe '${testName}' do
  before(:each) do
    @driver = Selenium::WebDriver.for :chrome
    @wait = Selenium::WebDriver::Wait.new(timeout: 10)
    @vars = {}
  end

  after(:each) do
    @driver.quit
  end

  def find_and_wait(selector)
    @wait.until { @driver.find_element(:css, selector).displayed? }
    return @driver.find_element(:css, selector)
  end

  it 'plays back the recorded steps' do
${formattedSteps}
  end
end
`
}

/**
 * Handles the 'run-test' IPC call. It generates a temporary RSpec file
 * from the saved test, executes it, and returns the output.
 */
const runRecording = async (appState: AppState): Promise<{ success: boolean; output: string }> => {
  if (!appState.savedTest) {
    return { success: false, output: 'No test has been saved to run.' }
  }

  const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}.rb`)

  try {
    console.log('[MainProcess] Generating and running test...')

    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    // Destructure the name and steps from the saved test
    const { name, steps } = appState.savedTest

    // Generate the test code using both name and steps
    const testCode = generateRspecCode(name, steps)

    // *** FIX IS HERE ***
    // Write the correctly generated 'testCode' variable to the file.
    await fs.writeFile(tempFilePath, testCode)
    console.log(`[MainProcess] Test file written to: ${tempFilePath}`)

    const command = `rspec ${tempFilePath}`
    console.log(`[MainProcess] Executing command: ${command}`)

    return await new Promise((resolve) => {
      exec(command, { env: executionEnv }, (error, stdout, stderr) => {
        if (stdout) console.log('[MainProcess] Test stdout:\n', stdout)
        if (stderr) console.error('[MainProcess] Test stderr:\n', stderr)
        if (error) {
          console.error('[MainProcess] Test execution failed with error object:', error)
          const fullErrorOutput = `RSpec execution failed.\n\n--- STDERR ---\n${stderr}\n\n--- STDOUT ---\n${stdout}\n\n--- ERROR --- \n${error.message}`
          resolve({ success: false, output: fullErrorOutput })
          return
        }
        resolve({ success: true, output: stdout })
      })
    })
  } catch (e: any) {
    console.error(`[MainProcess] A critical error occurred: ${e.message}`)
    return { success: false, output: e.message }
  } finally {
    try {
      await fs.unlink(tempFilePath)
      console.log(`[MainProcess] Cleaned up temp file: ${tempFilePath}`)
    } catch (cleanupError) {
      console.warn(`[MainProcess] Could not clean up temp file: ${cleanupError}`)
    }
  }
}

export default runRecording
