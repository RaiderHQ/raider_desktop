import { appState } from '../appState'
import runRecording from './runRecording'
import runSuite from './runSuite'
import { activeSuiteMode } from '../tests/suiteStore'
import type { Test } from '../../../shared/types/test'

type RunResult = { success: boolean; output: string }

const USE_LIVE_RUNNER = 'Use the live runner.'

/**
 * 'run-test', for projects that don't keep recorded tests as files: runs a
 * generated temporary file. Files-mode projects run on the live runner.
 */
export async function runTestHandler(
  suiteId: string,
  testId: string,
  projectPath: string,
  rubyCommand: string,
  _test?: Test
): Promise<RunResult> {
  if ((await activeSuiteMode()) === 'files') return { success: false, output: USE_LIVE_RUNNER }

  const cached = appState.suites.get(suiteId)?.tests.find((t) => t.id === testId)
  if (!cached) return { success: false, output: `Test with ID ${testId} not found.` }
  const { implicitWait, explicitWait, browser, headless } = appState.recorderSettings
  return runRecording({
    savedTest: cached,
    implicitWait,
    explicitWait,
    browser,
    headless,
    projectPath,
    rubyCommand,
    projectAutomation: appState.projectAutomation,
    projectFramework: appState.projectFramework
  })
}

/**
 * 'run-suite', for projects that don't keep recorded tests as files: runs
 * generated temporary files. Files-mode projects run on the live runner.
 */
export async function runSuiteHandler(
  suiteId: string,
  _projectPath: string,
  rubyCommand: string
): Promise<RunResult> {
  if ((await activeSuiteMode()) === 'files') return { success: false, output: USE_LIVE_RUNNER }
  return runSuite(suiteId, rubyCommand)
}
