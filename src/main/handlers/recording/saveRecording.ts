import { BrowserWindow } from 'electron'
import { activationSettled } from '../project/setActiveProject'
import { broadcast, saveRecordedTestInProject, storeForProject } from '../tests/recordedStore'
import type { Test } from '@foundation/Types/test'

/**
 * 'save-recording'. `projectPath` is the project the renderer is working on: a save that
 * was in flight while the project changed is refused, so it never lands in the other one.
 */
const handler = async (
  mainWindow: BrowserWindow | null,
  projectPath: unknown,
  testData: Test
): Promise<{ success: boolean; error?: string; test?: Test }> => {
  if (!mainWindow) {
    return { success: false, error: 'Main window is not available.' }
  }

  await activationSettled()
  const store = storeForProject(projectPath)
  if ('error' in store) return { success: false, error: store.error }
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
