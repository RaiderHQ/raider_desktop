import { appState } from './appState'
import runRecording from './runRecording' // Assuming runRecording is a handler

interface Test {
  id: string
  name: string
  url: string
  steps: string[]
}
interface Suite {
  id: string
  name: string
  tests: Test[]
}

export default async (_event: Electron.IpcMainEvent, suiteId: string) => {
  const suite = appState.suites.get(suiteId);
  if (!suite) {
    return { success: false, output: `Suite with ID ${suiteId} not found.` }
  }

  let fullOutput = `Running suite: ${suite.name}\n==========================\n\n`
  let overallSuccess = true;

  // Loop through each test in the suite and execute it
  for (const test of suite.tests) {
    fullOutput += `--- Running test: ${test.name} ---\n`
    const result = await runRecording({ savedTest: test })
    fullOutput += result.output + '\n';

    // If a test fails, mark the whole suite as failed and stop
    if (!result.success) {
      overallSuccess = false
      fullOutput += `\n--- TEST FAILED: ${test.name}. Stopping suite run. ---\n`
      break;
    }
    fullOutput += `--- TEST PASSED: ${test.name} ---\n\n`
  }

  fullOutput += `==========================\nSuite run finished.`
  return { success: overallSuccess, output: fullOutput }
}
