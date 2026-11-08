import { appState } from '../appState'
import runRecording from './runRecording'
import { activationSettled } from '../project/setActiveProject'
import { filesStore, PROJECT_CHANGED_ERROR } from '../tests/recordedStore'
import { GEM_TOO_OLD } from '../run/runner'
import { MOBILE_UNSUPPORTED } from '../project/projectLayout'
import type { Test } from '../../../shared/types/test'
import type { LegacyRunResult } from '../../../shared/types/prepareRun'

type RunResult = LegacyRunResult

const USE_LIVE_RUNNER = 'Use the live runner.'

/**
 * 'run-test', for projects that don't keep recorded tests as files: runs a
 * generated temporary file. Files-mode projects run on the live runner.
 */
export async function runTestHandler(
  testId: string,
  projectPath: string,
  rubyCommand: string,
  _test?: Test // kept for the IPC signature; the legacy path runs the cached test
): Promise<RunResult> {
  await activationSettled()
  if (!appState.projectPath) return { success: false, output: `Test with ID ${testId} not found.` }
  // A run asked for during a project switch must not start in the other project
  if (projectPath !== appState.projectPath) {
    return { success: false, output: PROJECT_CHANGED_ERROR }
  }
  if (appState.layout?.unsupportedReason === 'mobile') return { success: false, output: MOBILE_UNSUPPORTED }
  if (filesStore()) return { success: false, output: USE_LIVE_RUNNER }
  if (appState.layout?.runtimeSupported === false) return { success: false, output: GEM_TOO_OLD }

  const cached = appState.tests.get(testId)
  if (!cached) return { success: false, output: `Test with ID ${testId} not found.` }
  const { implicitWait, explicitWait, testIdAttribute, browser, headless } = appState.recorderSettings
  return runRecording({
    savedTest: cached,
    implicitWait,
    explicitWait,
    testIdAttribute,
    browser,
    headless,
    projectPath,
    rubyCommand,
    projectAutomation: appState.projectAutomation,
    projectFramework: appState.projectFramework
  })
}
