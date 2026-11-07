import { promises as fs } from 'fs'
import path from 'path'
import { activationSettled } from '../project/setActiveProject'
import {
  broadcast,
  filesStore,
  saveRecordedTestInProject,
  storeForProject
} from '../tests/recordedStore'
import { safeError } from '../../utils/safeLog'
import type { Test } from '../../../shared/types/test'
import type { PrepareTestRunResult } from '../../../shared/types/prepareRun'

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
 * 'prepare-test-run' (`projectPath` is the project the renderer is working on). In a project that keeps recorded tests as files, saves the
 * test when needed (`test`, when given, is saved first so a pending autosave
 * can't leave the file behind the editor) and returns the spec file to run. A
 * file edited in code is returned as it is. Nothing runs here.
 */
export async function prepareTestRun(
  projectPath: unknown,
  testId: string,
  test?: Test
): Promise<PrepareTestRunResult> {
  await activationSettled()
  // Without a project that keeps tests as files there is nothing to save: run a copy instead
  if (!filesStore()) return { mode: 'legacy' }
  // The renderer's project must be the active one, or a save would land in the wrong project
  const store = storeForProject(projectPath)
  if ('error' in store) return { error: store.error }

  const cached = store.tests.get(testId)
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
      const saved = await saveRecordedTestInProject(store, source)
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
