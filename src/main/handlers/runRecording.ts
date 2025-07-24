import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

interface AppState {
  savedTest: { name: string; steps: string[] } | null
  implicitWait: number
  explicitWait: number
  projectPath: string
}

/**
 * Generates the full Ruby RSpec code from an array of steps.
 * @param testName The name for the 'describe' block in RSpec.
 * @param steps The array of command strings.
 * @param implicitWait The implicit wait time in seconds.
 * @param explicitWait The explicit wait time in seconds.
 * @param projectPath The path to the project.
 */
function generateRspecCode(
  testName: string,
  steps: string[],
  implicitWait: number,
  explicitWait: number,
  projectPath: string
): string {
  const formattedSteps = steps.map((step) => `    ${step}`).join('\n    sleep(1)\n')
  // Make sure to escape backslashes in the project path for Windows
  const allurePath = path.join(projectPath, 'allure-results').replace(/\\/g, '\\\\')

  return `
require 'selenium-webdriver'
require 'rspec'
require 'allure-rspec'

AllureRspec.configure do |c|
  c.results_directory = '${allurePath}'
  c.clean_results_directory = true
end

describe '${testName}' do
  before(:each) do
    @driver = Selenium::WebDriver.for :chrome
    @driver.manage.timeouts.implicit_wait = ${implicitWait}
    @wait = Selenium::WebDriver::Wait.new(timeout: ${explicitWait})
    @vars = {}
  end

  after(:each) do |example|
    if example.exception
      Allure.add_attachment(
        name: 'screenshot',
        source: @driver.screenshot_as(:png),
        type: Allure::ContentType::PNG,
        test_case: true
      )
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
    console.log('[MainProcess] Generating and running test...')

    const newPath = (process.env.PATH || '')
      .split(path.delimiter)
      .filter((p) => !p.includes(path.join('node_modules', '.bin')))
      .join(path.delimiter)

    const executionEnv = { ...process.env, PATH: newPath }

    // Destructure the name and steps from the saved test
    const { name, steps } = appState.savedTest
    const { implicitWait, explicitWait, projectPath } = appState

    const testCode = generateRspecCode(name, steps, implicitWait, explicitWait, projectPath)

    await fs.writeFile(tempFilePath, testCode)
    console.log(`[MainProcess] Test file written to: ${tempFilePath}`)

    const command = `rspec ${tempFilePath} --format AllureRspec --format progress`
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
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    console.error(`[MainProcess] A critical error occurred: ${errorMessage}`)
    return { success: false, output: errorMessage }
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
