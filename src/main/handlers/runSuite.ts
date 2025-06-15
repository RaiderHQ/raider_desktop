import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { ipcMain } from 'electron'

// Define the shape of the data we expect
// NOTE: Ensure your Test objects actually contain a 'steps' array.
interface Test {
  id: string;
  name: string;
  steps: string[];
}

interface Suite {
  id: string;
  name: string;
  tests: Test[];
}

/**
 * Generates the full Ruby RSpec code from an array of steps.
 * This function is reused from the single test runner.
 */
function generateRspecCode(testName: string, steps: string[]): string {
  const formattedSteps = steps
    .map((step) => `    ${step}`)
    .join('\n    sleep(1)\n');
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
`;
}

/**
 * Executes a single test case and returns the result.
 * This is a helper extracted from the looping logic.
 */
async function executeTest(test: Test): Promise<{ success: boolean; output: string }> {
  const tempFilePath = path.join(os.tmpdir(), `test_${Date.now()}.rb`);
  try {
    if (!test.steps || test.steps.length === 0) {
      return { success: true, output: "Test has no steps. Skipped." };
    }

    const testCode = generateRspecCode(test.name, test.steps);
    await fs.writeFile(tempFilePath, testCode);

    const command = `rspec ${tempFilePath}`;

    return await new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          const fullErrorOutput = `RSpec execution failed.\n--- STDERR ---\n${stderr}\n--- STDOUT ---\n${stdout}\n--- ERROR --- \n${error.message}`;
          resolve({ success: false, output: fullErrorOutput });
        } else {
          resolve({ success: true, output: stdout });
        }
      });
    });
  } catch (e: any) {
    return { success: false, output: `A critical error occurred while preparing test '${test.name}': ${e.message}` };
  } finally {
    // Clean up the temporary file
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      console.warn(`[MainProcess] Could not clean up temp file: ${cleanupError}`);
    }
  }
}


/**
 * The main handler for running a full suite of tests.
 * It iterates through each test and executes it.
 */
async function runSuite(suiteToRun: Suite): Promise<{ success: boolean; output: string }> {
  if (!suiteToRun || !suiteToRun.tests || suiteToRun.tests.length === 0) {
    return { success: false, output: `Suite '${suiteToRun?.name || 'Unknown'}' contains no tests to run.` };
  }

  let fullOutput = `Running suite: ${suiteToRun.name} (${suiteToRun.tests.length} tests)\n================================\n\n`;
  let overallSuccess = true;

  for (const test of suiteToRun.tests) {
    fullOutput += `--- Test: ${test.name} ---\n`;
    const result = await executeTest(test);
    fullOutput += result.output + "\n--------------------------------\n\n";
    if (!result.success) {
      overallSuccess = false;
    }
  }

  fullOutput += `Suite execution finished. Overall Success: ${overallSuccess}`;
  return { success: overallSuccess, output: fullOutput };
}


// This registers the 'run-suite' event with your main process.
// The second argument to the handler function is the data sent from the frontend.
ipcMain.handle('run-suite', (_event, suite: Suite) => {
  return runSuite(suite);
});
