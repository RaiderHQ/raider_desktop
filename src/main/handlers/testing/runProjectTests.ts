import { promises as fs } from 'fs'
import path from 'path'
import { appState } from '../appState'
import runRecording from './runRecording'
import runSuite from './runSuite'
import { runSpecFiles } from './runSpecFiles'
import { activeSuiteMode, broadcast, filesStore, saveTestInSuite } from '../tests/suiteStore'
import type { FilesStore } from '../tests/suiteStore'
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
  if (store) return runRecordedFile(store, suiteId, testId, rubyCommand, test)

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

const fileExists = (projectPath: string, file: string): Promise<boolean> =>
  fs.access(path.join(projectPath, file)).then(
    () => true,
    () => false
  )

// Files mode: save when needed, then run the test's own spec file from the project
async function runRecordedFile(
  store: FilesStore,
  suiteId: string,
  testId: string,
  rubyCommand: string,
  test?: Test
): Promise<RunResult> {
  const cached = store.suites.get(suiteId)?.tests.find((t) => t.id === testId)
  const given = test?.id === testId ? test : undefined
  const source = given ?? cached
  if (!source) return { success: false, output: `Test with ID ${testId} not found.` }

  let file = cached?.file
  // Save when the editor is ahead of the file, the test was never saved, or its
  // recorded file went missing (saving puts it back from the sidecar)
  const missing =
    cached?.ownership === 'recorded' && (!file || !(await fileExists(store.projectPath, file)))
  if (!cached || missing || (given && !sameContent(given, cached))) {
    try {
      const saved = await saveTestInSuite(store, suiteId, source)
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
  // Put back any recorded file that went missing (from its sidecar), like run-test does.
  // Code-owned tests are never rewritten
  let restored = false
  for (const test of suite.tests) {
    if (test.ownership !== 'recorded') continue
    if (test.file && (await fileExists(store.projectPath, test.file))) continue
    try {
      const saved = await saveTestInSuite(store, suiteId, test)
      restored = true
      if (!saved.success && saved.error !== 'codeOwned')
        return { success: false, output: NOT_SAVED }
    } catch (error) {
      safeError('Could not restore a test file before running the suite:', error)
      return { success: false, output: NOT_SAVED }
    }
  }
  if (restored) broadcast(store)

  const current = store.suites.get(suiteId) ?? suite
  const listed = Array.from(new Set(current.tests.flatMap((t) => (t.file ? [t.file] : []))))
  // A file gone from a code-owned test can't be put back, and would fail the whole run
  const files: string[] = []
  for (const file of listed) if (await fileExists(store.projectPath, file)) files.push(file)
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
