import { BrowserWindow } from 'electron'
import {
  activeSuiteMode,
  broadcast,
  filesStore,
  lockedError,
  NO_PROJECT_ERROR,
  removeRecordedTest
} from './tests/suiteStore'

type DeletionResult = {
  success: boolean
  error?: string
}

export default async (
  _mainWindow: BrowserWindow | null,
  { testId }: { testId: string }
): Promise<DeletionResult> => {
  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false, error: lockedError() }

  const store = filesStore()
  if (!store) return { success: false, error: NO_PROJECT_ERROR }
  await removeRecordedTest(store, testId)
  broadcast(store)
  return { success: true }
}
