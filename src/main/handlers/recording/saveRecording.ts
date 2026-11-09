import { BrowserWindow } from 'electron'
import { activationSettled } from '../project/setActiveProject'
import { appState } from '../appState'
import {
  broadcast,
  saveRecordedTestInProject,
  storeForProject,
  type FilesStore
} from '../tests/recordedStore'
import { listSidecars } from '../tests/sidecar'
import type { Test } from '@foundation/Types/test'

export const FLOW_HAS_CHECKS_ERROR = 'A flow has no checks. Remove the check to save it.'
export const FLOW_SAVE_UNAVAILABLE_ERROR = "Raider can't save flows here yet."

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Any step of the untrusted test is a check; malformed steps are left to the store's check */
const hasCheck = (test: unknown): boolean =>
  isObject(test) &&
  Array.isArray(test.steps) &&
  test.steps.some((step) => isObject(step) && step.kind === 'assert')

/** A sidecar stored for `id` (wherever it sits) says it is a flow */
async function storedAsFlow(projectPath: string, id: unknown): Promise<boolean> {
  if (typeof id !== 'string') return false
  const entries = await listSidecars(projectPath)
  return entries.some(
    ({ fileRel, sidecar }) =>
      sidecar?.id === id && sidecar.file === fileRel && sidecar.kind === 'flow'
  )
}

/**
 * Whether `test` is a flow. Kind belongs to main: for a known test the snapshot's record (read
 * from its sidecar) decides; the renderer's kind or the recorder mode only name a new one.
 * With a check, every sign counts, so a renderer can never add a check to a flow. An unknown id
 * is looked up in the sidecars (the spec writer scans them for it anyway); known ids are not.
 */
async function isFlow(store: FilesStore, test: unknown, withCheck: boolean): Promise<boolean> {
  const id = isObject(test) ? test.id : undefined
  const known = typeof id === 'string' ? store.tests.get(id) : undefined
  const saysFlow = isObject(test) && test.kind === 'flow'
  if (known?.kind === 'flow') return true
  if (known) return withCheck && saysFlow
  if (saysFlow || appState.recordingMode === 'flow') return true
  // Any save of an unknown id: a clean save would otherwise rewrite a flow's sidecar as a test's
  return storedAsFlow(store.projectPath, id)
}

/**
 * 'save-recording'. `projectPath` is the project the renderer is working on: a save that
 * was in flight while the project changed is refused, so it never lands in the other one.
 * A flow never gets a check, whatever the renderer sends.
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
    const withCheck = hasCheck(testData)
    if (await isFlow(store, testData, withCheck)) {
      if (withCheck) return { success: false, error: FLOW_HAS_CHECKS_ERROR }
      // The flow writer (flows/<name>_flow.rb) goes here; the spec writer must never take a flow
      return { success: false, error: FLOW_SAVE_UNAVAILABLE_ERROR }
    }
    const result = await saveRecordedTestInProject(store, testData)
    if (!result.success) return result
    broadcast(store)
    return { success: true, test: result.test }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
