import { BrowserWindow } from 'electron'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import type { Test } from '@foundation/Types/test'

const handler = async (
  mainWindow: BrowserWindow | null,
  suiteId: string,
  testData: Test
): Promise<{ success: boolean; error?: string }> => {
  if (!mainWindow) {
    return { success: false, error: 'Main window is not available.' }
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
