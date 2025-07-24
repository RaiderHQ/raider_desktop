import { appState, getRecordingSettings } from './appState'
import runRecording from './runRecording'

export default async (
  suiteId: string,
  projectPath: string
): Promise<{ success: boolean; output: string }> => {
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, output: `Suite with ID ${suiteId} not found.` }
  }

  const { implicitWait, explicitWait } = getRecordingSettings()

  let fullOutput = `Running suite: ${suite.name}\n==========================\n\n`
  let overallSuccess = true

  for (const test of suite.tests) {
    fullOutput += `--- Running test: ${test.name} ---\n`
    const result = await runRecording({ savedTest: test, implicitWait, explicitWait, projectPath })
    fullOutput += `${result.output}\n`

    if (!result.success) {
      overallSuccess = false
      fullOutput += `\n--- TEST FAILED: ${test.name}. Stopping suite run. ---\n`
      break
    }
    fullOutput += `--- TEST PASSED: ${test.name} ---\n\n`
  }

  fullOutput += `==========================\nSuite run finished.`
  return { success: overallSuccess, output: fullOutput }
}
