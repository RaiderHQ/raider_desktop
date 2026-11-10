import { randomUUID } from 'crypto'
import { appState } from '../appState'
import {
  CodeOwnedError,
  convertibleTest,
  deleteRecordedTest,
  NotConvertibleError,
  FlowIdError,
  FlowIdTakenError,
  FlowRecordsUnsafeError,
  FlowsNotReadyError,
  FlowInputClashError,
  saveRecordedFlow,
  saveRecordedTest,
  setTagsForFile
} from './recordedTests'
import { FlowHasChecksError } from '../../codegen/flowFile'
import { safeError } from '../../utils/safeLog'
import { isStep } from '../../../shared/types/step'
import { normalizeTags } from '../../../shared/tags'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { ConvertToFlowResult, Sidecar } from '../../../shared/types/projectTest'
import type { Test } from '../../../shared/types/test'

/**
 * The recorded tests of a project, as they were when a handler started. Handlers write
 * through this snapshot, never through appState, so nothing lands in a project the user
 * has switched away from.
 */
export interface FilesStore {
  projectPath: string
  layout: ProjectLayout
  tests: Map<string, Test>
}

export const CANNOT_RECORD_ERROR =
  "Raider can't change these tests because this project can't record tests."
export const PROJECT_CHANGED_ERROR = 'The project was closed before this change could be saved.'
export const INVALID_TEST_ERROR = 'This test could not be saved.'
export const NO_PROJECT_ERROR = 'No project is open.'
export const importFailed = (count: number): string =>
  count === 1 ? '1 test could not be imported.' : `${count} tests could not be imported.`

/** Recorded tests can only be written into an RSpec project that can record. */
export const canRecordFiles = (layout: ProjectLayout): boolean =>
  layout.framework === 'rspec' && layout.recordable

/** Why there is no store: no project is open, or the open one can't record. */
export const noStoreError = (): string =>
  appState.projectPath && appState.layout ? CANNOT_RECORD_ERROR : NO_PROJECT_ERROR

/** A snapshot of the active project's tests, or null without a project or when it can't record. */
export function filesStore(): FilesStore | null {
  if (!appState.projectPath || !appState.layout || !canRecordFiles(appState.layout)) return null
  return { projectPath: appState.projectPath, layout: appState.layout, tests: appState.tests }
}

/**
 * The active store, but only for the project the renderer says it is working on: a save in
 * flight during a project switch must never land in the other project.
 */
export function storeForProject(projectPath: unknown): FilesStore | { error: string } {
  const store = filesStore()
  if (!store) return { error: noStoreError() }
  if (projectPath !== store.projectPath) return { error: PROJECT_CHANGED_ERROR }
  return store
}

/** Still the active project's store: a re-activation replaces the map, so it fails too. */
export const isCurrent = (store: FilesStore): boolean =>
  appState.projectPath === store.projectPath && appState.tests === store.tests

export class ProjectChangedError extends Error {
  constructor() {
    super(PROJECT_CHANGED_ERROR)
    this.name = 'ProjectChangedError'
  }
}

/** Sends the tests to the renderer, unless another project became active meanwhile. */
export function broadcast(store: FilesStore): void {
  if (isCurrent(store)) {
    appState.mainWindow?.webContents.send('tests-updated', Array.from(store.tests.values()))
  }
}

/** True when `test` can be stored as a sidecar (anything else would be unreadable later). */
export function isStorableTest(test: unknown): test is Test {
  const t = test as Test | null
  return (
    t !== null &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    t.id !== '' &&
    typeof t.name === 'string' &&
    (t.url === undefined || typeof t.url === 'string') &&
    Array.isArray(t.steps) &&
    t.steps.every(isStep)
  )
}

const fromSidecar = (sidecar: Sidecar, previous?: Test): Test => ({
  id: sidecar.id,
  name: sidecar.name,
  url: sidecar.url,
  steps: sidecar.steps,
  file: sidecar.file,
  ownership: 'recorded',
  ...(sidecar.tags && { tags: sidecar.tags }),
  ...(sidecar.kind && { kind: sidecar.kind }),
  ...(sidecar.inputs && { inputs: sidecar.inputs }),
  ...(previous?.hasTrace && { hasTrace: true })
})

export type SaveResult = { success: true; test: Test } | { success: false; error: string }

export const FLOW_HAS_CHECKS_ERROR = 'A flow has no checks. Remove the check to save it.'
/** The snapshot calls it a test but its record on disk is a flow's (changed outside Raider) */
export const FLOW_SAVE_UNAVAILABLE_ERROR =
  'This flow was changed outside Raider. Open the project again to save it.'
export const FLOWS_NOT_READY_ERROR = 'Set up flows first: run raider flow init in this project.'
export const FLOW_RECORDS_UNSAFE_ERROR =
  "Raider's flow records folder (.raider/tests/flows) is a link or not a folder, so the flow wasn't saved."
export const FLOW_ID_TAKEN_ERROR =
  "Another test or flow uses the same id, so Raider can't save this one."

const hasCheck = (test: Test): boolean => test.steps.some((step) => step.kind === 'assert')

/**
 * Whether `input` goes to the flow writer, or why it can't be saved at all. Kind belongs to main:
 * for a known test the snapshot's record (read from its sidecar) decides; the renderer's kind,
 * or `newIsFlow` (the recorder records a flow), only name a new one. With a check every sign
 * counts, deliberately: a known test the renderer calls a flow is refused too. The spec writer
 * then refuses any id a flow's record holds (FlowIdError).
 */
function routeOf(
  previous: Test | undefined,
  input: Test,
  newIsFlow: boolean
): 'test' | 'flow' | { error: string } {
  const check = hasCheck(input)
  const saysFlow = input.kind === 'flow'
  const flow = previous?.kind === 'flow' || (previous ? check && saysFlow : saysFlow || newIsFlow)
  if (!flow) return 'test'
  return check ? { error: FLOW_HAS_CHECKS_ERROR } : 'flow'
}

/** The fixed message for a flow writer's refusal, or null for any other error. */
function flowError(error: unknown): string | null {
  if (error instanceof FlowHasChecksError) return FLOW_HAS_CHECKS_ERROR
  if (error instanceof FlowsNotReadyError) return FLOWS_NOT_READY_ERROR
  if (error instanceof FlowIdTakenError) return FLOW_ID_TAKEN_ERROR
  if (error instanceof FlowRecordsUnsafeError) return FLOW_RECORDS_UNSAFE_ERROR
  // Built from a name that passed the input-name rule, so it is safe to show as is
  if (error instanceof FlowInputClashError) return error.message
  return null
}

/**
 * Saves `input` as a project file and keeps it in the snapshot. A test edited in code
 * is never rewritten: it comes back as `codeOwned` and is shown as such. A flow is never
 * written here, so it never gets a check, whichever handler saves it. `newIsFlow`: a test
 * this snapshot doesn't know is a flow (save-recording while the recorder records one).
 */
export async function saveRecordedTestInProject(
  store: FilesStore,
  input: Test,
  { newIsFlow = false }: { newIsFlow?: boolean } = {}
): Promise<SaveResult> {
  if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
  if (!isStorableTest(input)) return { success: false, error: INVALID_TEST_ERROR }
  const test: Test = { id: input.id, name: input.name, url: input.url ?? '', steps: input.steps }

  // Where a known test's file is, so the save reads that one sidecar instead of scanning them
  // all. Unknown (undefined) still scans: null would mean "no sidecar" and create a second file
  const previous = store.tests.get(test.id)

  // A flow goes to flows/<name>_flow.rb; the spec writer must never take a flow
  const route = routeOf(previous, input, newIsFlow)
  if (typeof route === 'object') return { success: false, error: route.error }

  let sidecar: Sidecar
  try {
    sidecar =
      route === 'flow'
        ? await saveRecordedFlow(store.projectPath, store.layout, test)
        : await saveRecordedTest(store.projectPath, store.layout, test, {
            knownFile: previous?.file
          })
  } catch (error) {
    const refused = flowError(error)
    if (refused) return { success: false, error: refused }
    if (error instanceof FlowIdError) {
      return {
        success: false,
        error: hasCheck(test) ? FLOW_HAS_CHECKS_ERROR : FLOW_SAVE_UNAVAILABLE_ERROR
      }
    }
    if (!(error instanceof CodeOwnedError)) throw error
    // Tell the renderer once: re-sending on every refused autosave would keep resetting its test
    if (previous && previous.ownership !== 'codeOwnedWasRecorded' && isCurrent(store)) {
      store.tests.set(test.id, { ...previous, ownership: 'codeOwnedWasRecorded' })
      broadcast(store)
    }
    return { success: false, error: 'codeOwned' }
  }
  if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
  const saved = fromSidecar(sidecar, previous)
  store.tests.set(test.id, saved)
  return { success: true, test: saved }
}

/**
 * Gives a test that was just saved its tags (the sidecar and the describe line), and keeps
 * the snapshot's copy in step. A failure is logged: the test is saved either way.
 */
export async function tagSavedTest(store: FilesStore, saved: Test, tags: string[]): Promise<Test> {
  const clean = normalizeTags(tags)
  if (clean.length === 0 || !saved.file) return saved
  try {
    const result = await setTagsForFile(store.projectPath, store.layout, saved.file, clean)
    if (result.kind === 'notFound' || result.kind === 'describeLine') return saved
  } catch (error) {
    safeError(`Could not tag ${saved.file}:`, error)
    return saved
  }
  const tagged: Test = { ...saved, tags: clean }
  if (isCurrent(store) && store.tests.has(saved.id)) store.tests.set(saved.id, tagged)
  return tagged
}

export type RemoveResult = { success: true; codeOwned?: true } | { success: false; error: string }

/**
 * Deletes a test's files, then forgets it. A test edited in code keeps its file (it then shows
 * as a code test) and is forgotten. Any other failure leaves the test where it is.
 */
export async function removeRecordedTest(store: FilesStore, testId: string): Promise<RemoveResult> {
  try {
    await deleteRecordedTest(store.projectPath, testId)
  } catch (error) {
    if (!(error instanceof CodeOwnedError)) {
      safeError(`Could not delete the file of recorded test ${testId}:`, error)
      return { success: false, error: 'The test could not be deleted.' }
    }
    store.tests.delete(testId)
    return { success: true, codeOwned: true }
  }
  store.tests.delete(testId)
  return { success: true }
}

export const CONVERT_FAILED_ERROR = 'This test could not be saved as a flow.'
export const CONVERT_NOT_FOUND_ERROR = 'This test could not be found.'
export const CONVERT_FLOW_ERROR = 'This is already a flow.'
export const CONVERT_CODE_OWNED_ERROR =
  "This test was changed in code, so Raider can't save it as a flow."

const CONVERT_REFUSALS = {
  notFound: CONVERT_NOT_FOUND_ERROR,
  flow: CONVERT_FLOW_ERROR,
  codeOwned: CONVERT_CODE_OWNED_ERROR
} as const

/**
 * Saves a copy of the recorded test `testId` as a new flow, under a new id, with the steps
 * read from its record here (never from the renderer). The test itself is left as it is.
 * With checks, nothing is written and their ids come back, unless `dropChecks` (the user
 * confirmed), which leaves them out of the copy only.
 */
export async function convertToFlow(
  store: FilesStore,
  testId: string,
  dropChecks: boolean
): Promise<ConvertToFlowResult> {
  if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
  let source: Sidecar
  try {
    source = await convertibleTest(store.projectPath, testId)
  } catch (error) {
    if (error instanceof NotConvertibleError) {
      return { success: false, error: CONVERT_REFUSALS[error.reason] }
    }
    throw error
  }
  const checks = source.steps.filter((step) => step.kind === 'assert').map((step) => step.id)
  if (checks.length > 0 && !dropChecks) {
    return { success: false, error: 'has-checks', stepIds: checks }
  }
  const flow: Test = {
    id: randomUUID(),
    name: source.name,
    url: source.url,
    steps: source.steps.filter((step) => step.kind !== 'assert')
  }
  let sidecar: Sidecar
  try {
    sidecar = await saveRecordedFlow(store.projectPath, store.layout, flow)
  } catch (error) {
    const refused = flowError(error)
    if (refused) return { success: false, error: refused }
    throw error
  }
  if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
  const saved = fromSidecar(sidecar)
  store.tests.set(saved.id, saved)
  return { success: true, test: saved }
}
