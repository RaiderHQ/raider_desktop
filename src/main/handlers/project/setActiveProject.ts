import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import { readSuitesFile } from '../suitePersistence'
import type { SuiteLock, SuiteMode } from '../appState'
import { detectProjectLayout } from './projectLayout'
import { migrateToProjectFiles } from '../tests/migrateToProjectFiles'
import { loadRecordedTests } from '../tests/loadTests'
import { safeError } from '../../utils/safeLog'
import type { Test } from '@foundation/Types/test'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'

/**
 * Makes the given project the active one (or clears it with null) and loads
 * its recorder settings and recorded tests. Single place to hook in per-project loading.
 */
type ActivationResult = {
  success: boolean
  settings?: RecorderSettings
  layout?: ProjectLayout
  error?: string
}

// Latest activation, so readers can wait for it and activations apply in call order
let activation: Promise<unknown> = Promise.resolve()

function setActiveProject(projectPath: string | null): Promise<ActivationResult> {
  const result = activation.then(() => activate(projectPath))
  activation = result
  return result
}

/** Resolves once any in-flight project activation has finished. */
export async function activationSettled(): Promise<void> {
  await activation
}

/**
 * Re-reads the recorder settings after something rewrote the project's config,
 * so runs and recordings use the new values without reopening the project.
 * Does nothing unless the given project is the active one.
 */
export async function refreshRecorderSettings(projectPath: string): Promise<void> {
  await activationSettled()
  if (projectPath !== appState.projectPath) return
  const settings = await readRecorderSettings(projectPath)
  // The active project may have changed while the config was being read
  if (projectPath === appState.projectPath) appState.recorderSettings = settings
}

/** Current recorder settings, once any in-flight project activation has finished. */
export async function getRecorderSettings(): Promise<RecorderSettings> {
  await activationSettled()
  return appState.recorderSettings
}

function clearActiveProject(): void {
  appState.projectPath = null
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  appState.layout = null
  appState.projectAutomation = null
  appState.projectFramework = null
  appState.tests = new Map()
  appState.suiteMode = 'files'
  appState.suiteLock = null
  appState.mainWindow?.webContents.send('tests-updated', [])
}

interface LoadedTests {
  mode: SuiteMode
  tests: Test[]
  /** Why the tests can't be changed, in locked mode */
  lock?: SuiteLock
  /** What to tell the renderer about the move to project files, if anything */
  migration?: { migrated: number; postponed: boolean }
}

const canRecordFiles = (layout: ProjectLayout): boolean => layout.recordable

/**
 * The recorded tests are the project's spec files + sidecars. Tests an older Raider kept in a
 * version 2 suites.json are moved to files first (recordable RSpec projects only); in any
 * other project that file is left alone and not shown until the suites-to-tags migration.
 */
async function loadProjectTests(projectPath: string, layout: ProjectLayout): Promise<LoadedTests> {
  // Recorded files in a project Raider can't record into any more: show them, change nothing
  if (!canRecordFiles(layout)) {
    return { mode: 'locked', tests: await loadRecordedTests(projectPath), lock: 'cannotRecord' }
  }
  let migration: LoadedTests['migration']
  try {
    const { migrated } = await migrateToProjectFiles(projectPath, layout)
    if (migrated > 0) migration = { migrated, postponed: false }
  } catch (error) {
    // Nothing was lost: the old suites file is still in place, so retry next time
    safeError('Recorded tests stay in the suites file for now:', error)
    migration = { migrated: 0, postponed: true }
  }
  // A suites file from a newer Raider: nothing is shown or written
  const state = await readSuitesFile(projectPath)
  if (state.kind === 'unknown') return { mode: 'locked', tests: [], lock: 'tooNew' }
  try {
    return { mode: 'files', tests: await loadRecordedTests(projectPath), migration }
  } catch (error) {
    // The project can't open, but nothing is lost: the tests are spec files and sidecars
    safeError('Could not load the recorded tests:', error)
    throw error
  }
}

async function activate(projectPath: string | null): Promise<ActivationResult> {
  try {
    appState.sessionUrl = null
    if (projectPath === null) {
      clearActiveProject()
    } else {
      // Load everything before swapping, so the tests and projectPath always change together
      const settings = await readRecorderSettings(projectPath)
      const layout = await detectProjectLayout(projectPath)
      // Runs before projectPath is published, so no handler writes tests meanwhile
      const loaded = await loadProjectTests(projectPath, layout)
      appState.recorderSettings = settings
      appState.projectPath = projectPath
      appState.layout = layout
      appState.projectAutomation = layout.automation
      appState.projectFramework = layout.framework
      appState.suiteMode = loaded.mode
      appState.suiteLock = loaded.lock ?? null
      appState.tests = new Map(loaded.tests.map((test) => [test.id, test]))
      const send = (channel: string, ...args: unknown[]): void =>
        appState.mainWindow?.webContents.send(channel, ...args)
      send('tests-updated', Array.from(appState.tests.values()))
      if (loaded.lock === 'tooNew') send('tests-too-new')
      if (loaded.migration) send('tests-migrated', loaded.migration)
    }
    return {
      success: true,
      settings: appState.recorderSettings,
      ...(appState.layout && { layout: appState.layout })
    }
  } catch (error) {
    // The renderer has already switched projects, so keeping the previous one active
    // would save recordings and settings into a project the user no longer sees
    clearActiveProject()
    return { success: false, error: (error as Error).message }
  }
}

export default setActiveProject
