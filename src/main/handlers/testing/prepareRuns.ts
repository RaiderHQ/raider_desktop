import { promises as fs } from 'fs'
import path from 'path'
import { activeSuiteMode, broadcast, filesStore, saveTestInSuite } from '../tests/suiteStore'
import { safeError } from '../../utils/safeLog'
import type { Test } from '../../../shared/types/test'
import type { PrepareSuiteRunResult, PrepareTestRunResult } from '../../../shared/types/prepareRun'

export const NOT_SAVED = 'The test could not be saved, so it was not run.'

const sameContent = (a: Test, b: Test): boolean =>
  a.name === b.name &&
  (a.url ?? '') === (b.url ?? '') &&
  JSON.stringify(a.steps) === JSON.stringify(b.steps)

const fileExists = (projectPath: string, file: string): Promise<boolean> =>
  fs.access(path.join(projectPath, file)).then(
    () => true,
    () => false
  )

/**
 * 'prepare-test-run'. In a project that keeps recorded tests as files, saves the
 * test when needed (`test`, when given, is saved first so a pending autosave
 * can't leave the file behind the editor) and returns the spec file to run. A
 * file edited in code is returned as it is. Nothing runs here.
 */
export async function prepareTestRun(
  suiteId: string,
  testId: string,
  test?: Test
): Promise<PrepareTestRunResult> {
  await activeSuiteMode()
  const store = filesStore()
  if (!store) return { mode: 'legacy' }

  const cached = store.suites.get(suiteId)?.tests.find((t) => t.id === testId)
  const given = test?.id === testId ? test : undefined
  const source = given ?? cached
  if (!source) return { error: `Test with ID ${testId} not found.` }

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
      else if (saved.error !== 'codeOwned') return { error: NOT_SAVED }
    } catch (error) {
      safeError('Could not save the test before running it:', error)
      return { error: NOT_SAVED }
    }
  }
  if (!file) return { error: `Test with ID ${testId} has no file to run.` }
  return { mode: 'files', file }
}

/**
 * 'prepare-suite-run'. In a project that keeps recorded tests as files, puts
 * back any recorded file that went missing (from its sidecar) and returns the
 * suite's files. Code-owned tests are never rewritten; a code-owned file that
 * is gone is listed in `skipped`, since it would fail the whole run.
 */
export async function prepareSuiteRun(suiteId: string): Promise<PrepareSuiteRunResult> {
  await activeSuiteMode()
  const store = filesStore()
  if (!store) return { mode: 'legacy' }

  const suite = store.suites.get(suiteId)
  if (!suite) return { error: `Suite with ID ${suiteId} not found.` }
  let restored = false
  for (const test of suite.tests) {
    if (test.ownership !== 'recorded') continue
    if (test.file && (await fileExists(store.projectPath, test.file))) continue
    try {
      const saved = await saveTestInSuite(store, suiteId, test)
      restored = true
      if (!saved.success && saved.error !== 'codeOwned') return { error: NOT_SAVED }
    } catch (error) {
      safeError('Could not restore a test file before running the suite:', error)
      return { error: NOT_SAVED }
    }
  }
  if (restored) broadcast(store)

  const current = store.suites.get(suiteId) ?? suite
  const listed = Array.from(new Set(current.tests.flatMap((t) => (t.file ? [t.file] : []))))
  const files: string[] = []
  const skipped: string[] = []
  for (const file of listed) {
    if (await fileExists(store.projectPath, file)) files.push(file)
    else skipped.push(file)
  }
  if (files.length === 0) return { error: 'This suite has no tests to run.' }
  return { mode: 'files', files, skipped }
}
