import { BrowserWindow } from 'electron'
import { activationSettled } from './project/setActiveProject'
import { broadcast, filesStore, noStoreError, removeRecordedTest } from './tests/recordedStore'

type DeletionResult = {
  success: boolean
  error?: string
  /** The file was edited in code and stays; its trace is kept too */
  codeOwned?: true
}

export default async (
  _mainWindow: BrowserWindow | null,
  { testId }: { testId: string }
): Promise<DeletionResult> => {
  await activationSettled()
  const store = filesStore()
  if (!store) return { success: false, error: noStoreError() }
  const result = await removeRecordedTest(store, testId)
  if (result.success) broadcast(store)
  return result
}
