import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

interface AppState {
  savedTest: { name: string; steps: string[] } | null
  implicitWait: number
  explicitWait: number
  projectPath: string
  rubyCommand: string
}

/**
 * Generates the full Ruby RSpec code from an array of steps.
 * @param testName The name for the 'describe' block in RSpec.
 * @param steps The array of command strings.
 * @param implicitWait The implicit wait time in seconds.
 * @param explicitWait The explicit wait time in seconds.
 * @param projectPath The path to the project.
 */
export function generateRspecCode(
  testName: string,
  steps: string[],
  implicitWait: number,
  explicitWait: number
): string {
  const formattedSteps = steps.map((step) => `    ${step}`).join('\n    sleep(1)\n')

  return `
require 'selenium-webdriver'
require 'rspec'

describe '${testName}' do
  before(:each) do
    @driver = Selenium::WebDriver.for :chrome
    @driver.manage.timeouts.implicit_wait = ${implicitWait}
    @wait = Selenium::WebDriver::Wait.new(timeout: ${explicitWait})
    @vars = {}
  end

  after(:each) do |example|
    if example.exception
      # You can add custom screenshot logic here if needed
    end
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
    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    // Destructure the name and steps from the saved test
    const { name, steps } = appState.savedTest
    const { implicitWait, explicitWait, rubyCommand } = appState

    const testCode = generateRspecCode(name, steps, implicitWait, explicitWait)

    await fs.writeFile(tempFilePath, testCode)

    const command = `${rubyCommand} -S rspec ${tempFilePath} --format json`

    return await new Promise((resolve) => {
      exec(command, { env: executionEnv }, (error, stdout, stderr) => {
        // RSpec with --format json outputs to stdout even on failure, so we check stderr for errors
        if (error && stderr) {
          const fullErrorOutput = `RSpec execution failed.\n\n--- STDERR ---\n${stderr}\n\n--- STDOUT ---\n${stdout}\n\n--- ERROR --- \n${error.message}`
          resolve({ success: false, output: fullErrorOutput })
          return
        }
        resolve({ success: true, output: stdout })
      })
    })
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, output: errorMessage }
  } finally {
    try {
      await fs.unlink(tempFilePath)
    } catch (cleanupError) {
      // Deliberately empty
    }
  }
}

export default runRecording
