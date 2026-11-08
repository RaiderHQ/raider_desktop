import { appState } from '../appState'
import runRecording from './runRecording'
import { activationSettled } from '../project/setActiveProject'
import { filesStore, PROJECT_CHANGED_ERROR } from '../tests/recordedStore'
import { detectProjectLayout } from '../project/projectLayout'
import { GEM_TOO_OLD } from '../run/runner'
import type { Test } from '../../../shared/types/test'
import { mobileNoLegacyResult, type LegacyRunResult } from '../../../shared/types/prepareRun'

type RunResult = LegacyRunResult

const USE_LIVE_RUNNER = 'Use the live runner.'

/** True for an Appium project, read from its Gemfile while its layout isn't known yet */
async function isMobileProject(): Promise<boolean> {
  if (appState.layout) return appState.layout.automation === 'appium'
  const path = appState.projectPath
  if (!path) return false
  try {
    return (await detectProjectLayout(path)).automation === 'appium'
  } catch {
    // An unreadable Gemfile says nothing about mobile; the run reports its own error
    return false
  }
}

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
  if (filesStore()) return { success: false, output: USE_LIVE_RUNNER }
  if (appState.layout?.runtimeSupported === false) return { success: false, output: GEM_TOO_OLD }
  if (await isMobileProject()) return mobileNoLegacyResult()

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
