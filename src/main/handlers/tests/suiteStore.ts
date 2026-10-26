import { appState } from '../appState'
import type { SuiteMode } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { saveSuiteIndex } from '../suitePersistence'
import type { SuiteIndexEntry } from '../suitePersistence'
import { CodeOwnedError, deleteRecordedTest, saveRecordedTest } from './recordedTests'
import { safeError } from '../../utils/safeLog'
import { isStep } from '../../../shared/types/step'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Suite } from '../../../shared/types/suite'
import type { Test } from '../../../shared/types/test'

/**
 * The suites of a project that keeps its recorded tests as files, as they were
 * when a handler started. Handlers write through this snapshot, never through
 * appState, so nothing lands in a project the user has switched away from.
 */
export interface FilesStore {
  projectPath: string
  layout: ProjectLayout
  index: Map<string, SuiteIndexEntry>
  suites: Map<string, Suite>
}

export const LOCKED_ERROR =
  'These suites were saved by a newer version of Raider and cannot be changed.'
export const PROJECT_CHANGED_ERROR = 'The project was closed before this change could be saved.'
export const INVALID_TEST_ERROR = 'This test could not be saved.'
export const importFailed = (count: number): string =>
  count === 1 ? '1 test could not be imported.' : `${count} tests could not be imported.`

/** The active project's suite mode, once any in-flight activation has finished. */
export async function activeSuiteMode(): Promise<SuiteMode> {
  await activationSettled()
  return appState.suiteMode
}

/** A snapshot of the active files-mode project, or null in any other mode or without a project. */
export function filesStore(): FilesStore | null {
  if (appState.suiteMode !== 'files' || !appState.projectPath || !appState.layout) return null
  return {
    projectPath: appState.projectPath,
    layout: appState.layout,
    index: appState.suiteIndex,
    suites: appState.suites
  }
}

/** Still the active project's store: a re-activation replaces the maps, so it fails too. */
export const isCurrent = (store: FilesStore): boolean =>
  appState.suiteMode === 'files' &&
  appState.projectPath === store.projectPath &&
  appState.suiteIndex === store.index

export class ProjectChangedError extends Error {
  constructor() {
    super(PROJECT_CHANGED_ERROR)
    this.name = 'ProjectChangedError'
  }
}

/** Writes the index of the snapshot's project, only while it is still the active one. */
export async function saveIndex(store: FilesStore): Promise<void> {
  if (!isCurrent(store)) throw new ProjectChangedError()
  await saveSuiteIndex(store.projectPath, Array.from(store.index.values()))
}

/** Sends the suites to the renderer, unless another project became active meanwhile. */
export function broadcast(store: FilesStore): void {
  if (isCurrent(store)) {
    appState.mainWindow?.webContents.send('suite-updated', Array.from(store.suites.values()))
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
  ...(previous?.hasTrace && { hasTrace: true })
})

// A test can be listed in several suites: every copy shows the same file
function updateCopies(store: FilesStore, testId: string, update: (test: Test) => Test): void {
  for (const suite of store.suites.values()) {
    suite.tests = suite.tests.map((test) => (test.id === testId ? update(test) : test))
  }
}

export type SaveResult = { success: true; test: Test } | { success: false; error: string }

/**
 * Saves `test` as a project file and lists it in the suite. A test edited in code
 * is never rewritten: it comes back as `codeOwned` and is shown as such.
 */
export async function saveTestInSuite(
  store: FilesStore,
  suiteId: string,
  input: Test
): Promise<SaveResult> {
  const entry = store.index.get(suiteId)
  const suite = store.suites.get(suiteId)
  if (!entry || !suite || !isCurrent(store)) {
    return { success: false, error: `Suite with ID ${suiteId} not found.` }
  }
  if (!isStorableTest(input)) return { success: false, error: INVALID_TEST_ERROR }
  const test: Test = { id: input.id, name: input.name, url: input.url ?? '', steps: input.steps }

  let sidecar: Sidecar
  try {
    sidecar = await saveRecordedTest(store.projectPath, store.layout, test)
  } catch (error) {
    if (!(error instanceof CodeOwnedError)) throw error
    // Tell the renderer once: re-sending on every refused autosave would keep resetting its test
    const known = Array.from(store.suites.values()).some((s) =>
      s.tests.some((t) => t.id === test.id && t.ownership !== 'codeOwnedWasRecorded')
    )
    if (known) {
      updateCopies(store, test.id, (t) => ({ ...t, ownership: 'codeOwnedWasRecorded' }))
      broadcast(store)
    }
    return { success: false, error: 'codeOwned' }
  }

  if (!entry.testIds.includes(test.id)) {
    entry.testIds.push(test.id)
    try {
      await saveIndex(store)
    } catch (error) {
      // The file is saved; without the index entry it shows up as a recorded file, not in the suite
      entry.testIds = entry.testIds.filter((id) => id !== test.id)
      throw error
    }
  }
  updateCopies(store, test.id, (previous) => fromSidecar(sidecar, previous))
  const saved = suite.tests.find((t) => t.id === test.id) ?? fromSidecar(sidecar)
  if (!suite.tests.includes(saved)) suite.tests.push(saved)
  return { success: true, test: saved }
}

/**
 * Saves imported suites as project files and lists them, after the existing
 * suites or, with `replace`, instead of them (their files stay in the project).
 * Every test must carry a fresh id, so no file is ever replaced. Returns the
 * suites as listed and how many tests could not be saved.
 */
export async function addSuites(
  store: FilesStore,
  imported: Suite[],
  { replace = false }: { replace?: boolean } = {}
): Promise<{ suites: Suite[]; failed: number }> {
  if (!isCurrent(store)) throw new ProjectChangedError()
  let failed = 0
  const suites: Suite[] = []
  for (const suite of imported) {
    const tests: Test[] = []
    for (const test of suite.tests) {
      try {
        if (!isStorableTest(test)) throw new Error(INVALID_TEST_ERROR)
        tests.push(fromSidecar(await saveRecordedTest(store.projectPath, store.layout, test)))
      } catch (error) {
        safeError(`Could not import test "${test.name}":`, error)
        failed++
      }
    }
    suites.push({ id: suite.id, name: suite.name, tests })
  }

  const before = { index: Array.from(store.index), suites: Array.from(store.suites) }
  if (replace) {
    store.index.clear()
    store.suites.clear()
  }
  for (const suite of suites) {
    store.index.set(suite.id, {
      id: suite.id,
      name: suite.name,
      testIds: suite.tests.map((t) => t.id)
    })
    store.suites.set(suite.id, suite)
  }
  try {
    await saveIndex(store)
  } catch (error) {
    // The saved files stay in the project as recorded tests outside any suite
    store.index.clear()
    store.suites.clear()
    before.index.forEach(([id, entry]) => store.index.set(id, entry))
    before.suites.forEach(([id, suite]) => store.suites.set(id, suite))
    throw error
  }
  return { suites, failed }
}

/**
 * Deletes the files of tests no suite lists any more. A test edited in code
 * keeps its file; any other failure is logged and the file stays too.
 */
export async function releaseTests(store: FilesStore, testIds: string[]): Promise<void> {
  const listed = new Set(Array.from(store.index.values()).flatMap((entry) => entry.testIds))
  for (const testId of new Set(testIds)) {
    if (listed.has(testId)) continue
    try {
      await deleteRecordedTest(store.projectPath, testId)
    } catch (error) {
      if (!(error instanceof CodeOwnedError)) {
        safeError(`Could not delete the file of recorded test ${testId}:`, error)
      }
    }
  }
}

/** Whether any suite still lists the test (it may sit in several). */
export const isListed = (testId: string): boolean =>
  Array.from(appState.suites.values()).some((suite) => suite.tests.some((t) => t.id === testId))
