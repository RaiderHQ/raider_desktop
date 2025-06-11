import { randomUUID } from 'crypto' // <-- Also add the import here
import type { BrowserWindow } from 'electron'
import type { AppState, Test } from './createSuite' // Reuse types

const saveRecording = (
  appState: AppState,
  mainWindow: BrowserWindow | null,
  suiteId: string,
  testData: Test
): { success: boolean; error?: string } => {
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, error: 'Suite not found' }
  }

  const testIndex = suite.tests.findIndex((t) => t.id === testData.id)

  if (testIndex !== -1) {
    // Update existing test
    suite.tests[testIndex] = testData
  } else {
    // Add new test, ensuring it has a unique ID from the backend
    suite.tests.push({ ...testData, id: randomUUID() })
  }

  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  return { success: true }
}

export default saveRecording
