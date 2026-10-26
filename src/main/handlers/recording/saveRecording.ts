import { BrowserWindow } from 'electron'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import {
  activeSuiteMode,
  broadcast,
  filesStore,
  lockedError,
  saveTestInSuite
} from '../tests/suiteStore'
import type { Test } from '@foundation/Types/test'

const handler = async (
  mainWindow: BrowserWindow | null,
  suiteId: string,
  testData: Test
): Promise<{ success: boolean; error?: string }> => {
  if (!mainWindow) {
    return { success: false, error: 'Main window is not available.' }
  }

  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false, error: lockedError() }

  const store = filesStore()
  if (store) {
    try {
      const result = await saveTestInSuite(store, suiteId, testData)
      if (!result.success) return result
      broadcast(store)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, error: `Suite with ID ${suiteId} not found.` }
  }

  const existingTestIndex = suite.tests.findIndex((t) => t.id === testData.id)

  if (existingTestIndex !== -1) {
    // Update existing test
    const existingTest = suite.tests[existingTestIndex]
    suite.tests[existingTestIndex] = {
      ...testData,
      hasTrace: testData.hasTrace ?? existingTest.hasTrace
    }
  } else {
    // Add new test
    suite.tests.push(testData)
  }

  // Persist the updated suites map
  appState.suites.set(suiteId, suite)
  await persistActiveSuites()
  mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

  return { success: true }
}

export default handler
