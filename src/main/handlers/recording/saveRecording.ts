import { BrowserWindow } from 'electron'
import {
  activeSuiteMode,
  broadcast,
  filesStore,
  lockedError,
  NO_PROJECT_ERROR,
  saveRecordedTestInProject
} from '../tests/suiteStore'
import type { Test } from '@foundation/Types/test'

const handler = async (
  mainWindow: BrowserWindow | null,
  testData: Test
): Promise<{ success: boolean; error?: string; test?: Test }> => {
  if (!mainWindow) {
    return { success: false, error: 'Main window is not available.' }
  }

  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false, error: lockedError() }

  const store = filesStore()
  if (!store) return { success: false, error: NO_PROJECT_ERROR }
  try {
    const result = await saveRecordedTestInProject(store, testData)
    if (!result.success) return result
    broadcast(store)
    return { success: true, test: result.test }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
