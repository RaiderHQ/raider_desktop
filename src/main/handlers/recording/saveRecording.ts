import { BrowserWindow } from 'electron'
import { activationSettled } from '../project/setActiveProject'
import { appState } from '../appState'
import { broadcast, saveRecordedTestInProject, storeForProject } from '../tests/recordedStore'
import type { Test } from '@foundation/Types/test'

/**
 * 'save-recording'. `projectPath` is the project the renderer is working on: a save that
 * was in flight while the project changed is refused, so it never lands in the other one.
 * A flow never gets a check: the store refuses it, whatever the renderer sends.
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
    // A new test saved while the recorder records a flow is that flow
    const result = await saveRecordedTestInProject(store, testData, {
      newIsFlow: appState.recordingMode === 'flow'
    })
    if (!result.success) return result
    broadcast(store)
    return { success: true, test: result.test }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
