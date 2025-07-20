import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { appState } from './appState'
import type { Test } from '../types'

/**
 * Saves a recording (test) to a specific suite.
 * If the test already exists, it's updated. If it's new, it's added.
 * After saving, it notifies the main window to refresh the UI.
 */
const saveRecording = (
  mainWindow: BrowserWindow | null,
  suiteId: string,
  testData: Test
): { success: boolean; error?: string } => {
  // 1. Validate the input
  if (!mainWindow) {
    console.error('[MainProcess] Cannot save recording: mainWindow is not available.')
    return { success: false, error: 'Main window not found.' }
  }
  if (!suiteId || !testData) {
    console.error('[MainProcess] Invalid data received for saveRecording.')
    return { success: false, error: 'Invalid suite ID or test data.' }
  }

  // 2. Find the correct suite
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    console.error(`[MainProcess] Suite with ID "${suiteId}" not found.`)
    return { success: false, error: 'Suite not found' }
  }

  // 3. Find and update, or add the new test
  const testIndex = suite.tests.findIndex((t) => t.id === testData.id)

  if (testIndex !== -1) {
    // Test exists, so update it
    suite.tests[testIndex] = testData
    console.log(`[MainProcess] Updated test: "${testData.name}"`)
  } else {
    // Test is new, add it to the suite's test array
    suite.tests.push({ ...testData, id: testData.id || randomUUID() })
    console.log(`[MainProcess] Added new test: "${testData.name}"`)
  }

  // 4. Notify the UI of the update
  mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

  return { success: true }
}

export default saveRecording
