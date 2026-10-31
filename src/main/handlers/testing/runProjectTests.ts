import { appState } from '../appState'
import runRecording from './runRecording'
import runSuite from './runSuite'
import { runSpecFiles, toRunResult } from './runSpecFiles'
import { filesStore } from '../tests/suiteStore'
import { prepareSuiteRun, prepareTestRun } from './prepareRuns'
import type { Test } from '../../../shared/types/test'

type RunResult = { success: boolean; output: string }

const runFiles = async (
  projectPath: string,
  files: string[],
  rubyCommand: string
): Promise<RunResult> => {
  try {
    return toRunResult(await runSpecFiles(projectPath, files, rubyCommand))
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 'run-test'. In a project that keeps recorded tests as files, the test's own
 * spec file runs from the project; `test`, when given, is saved first so a
 * pending autosave can't leave the file behind the editor. A file edited in
 * code is run as it is. Other projects run a generated temporary file.
 */
export async function runTestHandler(
  suiteId: string,
  testId: string,
  projectPath: string,
  rubyCommand: string,
  test?: Test
): Promise<RunResult> {
  const prepared = await prepareTestRun(suiteId, testId, test)
  if ('error' in prepared) return { success: false, output: prepared.error }
  if (prepared.mode === 'files')
    return runFiles(filesStore()!.projectPath, [prepared.file], rubyCommand)

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
 * 'run-suite'. In a project that keeps recorded tests as files, every file of
 * the suite runs in one rspec call from the project. Others run generated
 * temporary files.
 */
export async function runSuiteHandler(
  suiteId: string,
  _projectPath: string,
  rubyCommand: string
): Promise<RunResult> {
  const prepared = await prepareSuiteRun(suiteId)
  if ('error' in prepared) return { success: false, output: prepared.error }
  if (prepared.mode === 'legacy') return runSuite(suiteId, rubyCommand)
  return runFiles(filesStore()!.projectPath, prepared.files, rubyCommand)
}
