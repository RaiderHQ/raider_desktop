import { appState } from './appState'
import { BrowserWindow } from 'electron'
import { persistActiveSuites } from './suitePersistence'
import { safeError, safeWarn } from '../utils/safeLog'
import {
  activeSuiteMode,
  filesStore,
  LOCKED_ERROR,
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
  const before = entry.testIds
  entry.testIds = before.filter((id) => id !== testId)
  if (entry.testIds.length === before.length) {
    safeWarn(`Warning: Test with ID ${testId} was not found in suite "${entry.name}".`)
  }
  try {
    await saveIndex(store)
  } catch (error) {
    entry.testIds = before
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
  if (mode === 'locked') return { success: false, error: LOCKED_ERROR }

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
