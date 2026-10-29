import { appState } from './appState'
import { BrowserWindow } from 'electron'
import { persistActiveSuites } from './suitePersistence'
import { safeError, safeWarn } from '../utils/safeLog'
import {
  activeSuiteMode,
  filesStore,
  lockedError,
  releaseTests,
  saveIndex
} from './tests/suiteStore'
import type { FilesStore } from './tests/suiteStore'

type DeletionResult = {
  success: boolean
  error?: string
}

// Unlists the test, then deletes its file unless another suite lists it or it was edited in code
async function deleteFromFiles(
  store: FilesStore,
  suiteId: string,
  testId: string
): Promise<DeletionResult> {
  const entry = store.index.get(suiteId)
  if (!entry) {
    safeError(`Error: Attempted to delete test from a non-existent suite (ID: ${suiteId}).`)
    return { success: false, error: `Suite with ID ${suiteId} not found.` }
  }
  const position = entry.testIds.indexOf(testId)
  if (position === -1) {
    // Nothing to unlist, so nothing to delete: the file may belong to another suite or none
    safeWarn(`Warning: Test with ID ${testId} was not found in suite "${entry.name}".`)
    return { success: true }
  }
  entry.testIds = entry.testIds.filter((id) => id !== testId)
  try {
    await saveIndex(store)
  } catch (error) {
    // Put it back in its place, keeping any change made meanwhile
    if (!entry.testIds.includes(testId)) {
      entry.testIds.splice(Math.min(position, entry.testIds.length), 0, testId)
    }
    return { success: false, error: (error as Error).message }
  }
  const suite = store.suites.get(suiteId)
  if (suite) suite.tests = suite.tests.filter((test) => test.id !== testId)
  await releaseTests(store, [testId])
  return { success: true }
}

export default async (
  mainWindow: BrowserWindow | null,
  { suiteId, testId }: { suiteId: string; testId: string }
): Promise<DeletionResult> => {
  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false, error: lockedError() }

  const store = filesStore()
  if (store) {
    const result = await deleteFromFiles(store, suiteId, testId)
    if (result.success) {
      mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
    }
    return result
  }

  const suite = appState.suites.get(suiteId)

  if (!suite) {
    safeError(`Error: Attempted to delete test from a non-existent suite (ID: ${suiteId}).`)
    return { success: false, error: `Suite with ID ${suiteId} not found.` }
  }

  const initialTestCount = suite.tests.length
  suite.tests = suite.tests.filter((test) => test.id !== testId)

  if (suite.tests.length === initialTestCount) {
    safeWarn(`Warning: Test with ID ${testId} was not found in suite "${suite.name}".`)
  }

  await persistActiveSuites()
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))

  return { success: true }
}
