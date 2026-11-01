import { appState } from '../appState'
import runRecording from './runRecording'
import runSuite from './runSuite'
import { activeSuiteMode } from '../tests/suiteStore'
import { detectProjectLayout } from '../project/projectLayout'
import type { Test } from '../../../shared/types/test'
import { mobileNoLegacyResult, type LegacyRunResult } from '../../../shared/types/prepareRun'

type RunResult = LegacyRunResult

const USE_LIVE_RUNNER = 'Use the live runner.'

/** True for an Appium project, read from its Gemfile while its layout isn't known yet */
async function isMobileProject(projectPath: string): Promise<boolean> {
  if (appState.layout) return appState.layout.automation === 'appium'
  const path = appState.projectPath ?? projectPath
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
  suiteId: string,
  testId: string,
  projectPath: string,
  rubyCommand: string,
  _test?: Test // kept for the IPC signature; the legacy path runs the cached test
): Promise<RunResult> {
  if ((await activeSuiteMode()) === 'files') return { success: false, output: USE_LIVE_RUNNER }
  if (await isMobileProject(projectPath)) return mobileNoLegacyResult()

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
  projectPath: string,
  rubyCommand: string
): Promise<RunResult> {
  if ((await activeSuiteMode()) === 'files') return { success: false, output: USE_LIVE_RUNNER }
  if (await isMobileProject(projectPath)) return mobileNoLegacyResult()
  return runSuite(suiteId, rubyCommand)
}
