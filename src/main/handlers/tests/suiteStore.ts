import { appState } from '../appState'
import type { SuiteMode } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import {
  CodeOwnedError,
  deleteRecordedTest,
  saveRecordedTest,
  setTagsForFile
} from './recordedTests'
import { safeError } from '../../utils/safeLog'
import { isStep } from '../../../shared/types/step'
import { normalizeTags } from '../../../shared/tags'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Test } from '../../../shared/types/test'

/**
 * The recorded tests of a project that keeps them as files, as they were when a
 * handler started. Handlers write through this snapshot, never through appState,
 * so nothing lands in a project the user has switched away from.
 */
export interface FilesStore {
  projectPath: string
  layout: ProjectLayout
  tests: Map<string, Test>
}

/** Why the active project's tests can't be changed (only meaningful in locked mode). */
export const lockedError = (): string =>
  appState.suiteLock === 'cannotRecord'
    ? "Raider can't change these tests because this project can no longer record tests."
    : 'These tests were saved by a newer version of Raider and cannot be changed.'
export const PROJECT_CHANGED_ERROR = 'The project was closed before this change could be saved.'
export const INVALID_TEST_ERROR = 'This test could not be saved.'
export const importFailed = (count: number): string =>
  count === 1 ? '1 test could not be imported.' : `${count} tests could not be imported.`
export const NO_PROJECT_ERROR = 'No project is open.'

/** The active project's mode, once any in-flight activation has finished. */
export async function activeSuiteMode(): Promise<SuiteMode> {
  await activationSettled()
  return appState.suiteMode
}

/** A snapshot of the active files-mode project, or null in any other mode or without a project. */
export function filesStore(): FilesStore | null {
  if (appState.suiteMode !== 'files' || !appState.projectPath || !appState.layout) return null
  return { projectPath: appState.projectPath, layout: appState.layout, tests: appState.tests }
}

/** Still the active project's store: a re-activation replaces the map, so it fails too. */
export const isCurrent = (store: FilesStore): boolean =>
  appState.suiteMode === 'files' &&
  appState.projectPath === store.projectPath &&
  appState.tests === store.tests

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
  ...(previous?.hasTrace && { hasTrace: true })
})

export type SaveResult = { success: true; test: Test } | { success: false; error: string }

/**
 * Saves `input` as a project file and keeps it in the snapshot. A test edited in code
 * is never rewritten: it comes back as `codeOwned` and is shown as such.
 */
export async function saveRecordedTestInProject(
  store: FilesStore,
  input: Test
): Promise<SaveResult> {
  if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
  if (!isStorableTest(input)) return { success: false, error: INVALID_TEST_ERROR }
  const test: Test = { id: input.id, name: input.name, url: input.url ?? '', steps: input.steps }

  // Where a known test's file is, so the save reads that one sidecar instead of scanning them
  // all. Unknown (undefined) still scans: null would mean "no sidecar" and create a second file
  const previous = store.tests.get(test.id)

  let sidecar: Sidecar
  try {
    sidecar = await saveRecordedTest(store.projectPath, store.layout, test, {
      knownFile: previous?.file
    })
  } catch (error) {
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

/**
 * Deletes a test's files and forgets it. A test edited in code keeps its file (it then
 * shows as a code test); any other failure is logged and the file stays too.
 */
export async function removeRecordedTest(store: FilesStore, testId: string): Promise<void> {
  store.tests.delete(testId)
  try {
    await deleteRecordedTest(store.projectPath, testId)
  } catch (error) {
    if (!(error instanceof CodeOwnedError)) {
      safeError(`Could not delete the file of recorded test ${testId}:`, error)
    }
  }
}

/** Whether the active project still has the test. */
export const isListed = (testId: string): boolean => appState.tests.has(testId)
