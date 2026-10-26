import { appState } from '../appState'
import runRecording from './runRecording'
import runSuite from './runSuite'
import { runSpecFiles } from './runSpecFiles'
import { activeSuiteMode, broadcast, filesStore, saveTestInSuite } from '../tests/suiteStore'
import { safeError } from '../../utils/safeLog'
import type { Test } from '../../../shared/types/test'

type RunResult = { success: boolean; output: string }

const NOT_SAVED = 'The test could not be saved, so it was not run.'

const sameContent = (a: Test, b: Test): boolean =>
  a.name === b.name &&
  (a.url ?? '') === (b.url ?? '') &&
  JSON.stringify(a.steps) === JSON.stringify(b.steps)

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
  await activeSuiteMode()
  const store = filesStore()
  const cached = (store?.suites ?? appState.suites).get(suiteId)?.tests.find((t) => t.id === testId)
  if (!cached) return { success: false, output: `Test with ID ${testId} not found.` }

  if (!store) {
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

  let file = cached.file
  if (test?.id === testId && !sameContent(test, cached)) {
    try {
      const saved = await saveTestInSuite(store, suiteId, test)
      broadcast(store)
      if (saved.success) file = saved.test.file
      else if (saved.error !== 'codeOwned') return { success: false, output: NOT_SAVED }
    } catch (error) {
      safeError('Could not save the test before running it:', error)
      return { success: false, output: NOT_SAVED }
    }
  }
  if (!file) return { success: false, output: `Test with ID ${testId} has no file to run.` }

  try {
    const result = await runSpecFiles(store.projectPath, [file], rubyCommand)
    if (result.exitCode !== 0 && result.stderr) {
      const fullErrorOutput = `Test execution failed.\n\n--- STDERR ---\n${result.stderr}\n\n--- STDOUT ---\n${result.stdout}`
      return { success: false, output: fullErrorOutput }
    }
    return { success: true, output: result.stdout }
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
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
  await activeSuiteMode()
  const store = filesStore()
  if (!store) return runSuite(suiteId, rubyCommand)

  const suite = store.suites.get(suiteId)
  if (!suite) return { success: false, output: `Suite with ID ${suiteId} not found.` }
  const files = Array.from(new Set(suite.tests.flatMap((t) => (t.file ? [t.file] : []))))
  if (files.length === 0) return { success: false, output: 'This suite has no tests to run.' }

  try {
    const result = await runSpecFiles(store.projectPath, files, rubyCommand)
    return result.stdout
      ? { success: true, output: result.stdout }
      : { success: false, output: result.stderr }
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
}
