import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import {
  loadSuiteIndex,
  loadSuites,
  readSuitesFile,
  LegacySuitesFileError,
  UnknownSuitesVersionError
} from '../suitePersistence'
import type { SuiteIndexEntry } from '../suitePersistence'
import type { SuiteMode } from '../appState'
import { detectProjectLayout } from './projectLayout'
import { migrateToProjectFiles } from '../tests/migrateToProjectFiles'
import { assembleFromIndex } from '../tests/assembleSuites'
import { safeError } from '../../utils/safeLog'
import type { Suite } from '@foundation/Types/suite'
import type { RecorderSettings } from '@shared/types/recorderSettings'
import type { ProjectLayout } from '@shared/types/projectLayout'

/**
 * Makes the given project the active one (or clears it with null) and loads
 * its recorder settings and suites. Single place to hook in per-project loading.
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
  appState.suites = new Map()
  appState.suiteMode = 'legacy'
  appState.suiteIndex = new Map()
  appState.mainWindow?.webContents.send('suite-updated', [])
}

interface LoadedSuites {
  mode: SuiteMode
  suites: Suite[]
  index: SuiteIndexEntry[]
  recoveredFromCorrupt: boolean
  backupSaved?: boolean
  /** suites.json was written by a newer Raider */
  tooNew?: boolean
  /** What to tell the renderer about the move to project files, if anything */
  migration?: { migrated: number; postponed: boolean }
}

const canRecordFiles = (layout: ProjectLayout): boolean =>
  layout.framework === 'rspec' && layout.recordable

// Version 2 suites (Cucumber, non-recordable, or a postponed migration)
async function loadLegacy(projectPath: string, layout: ProjectLayout): Promise<LoadedSuites> {
  // loadSuites would move a version 3 or newer file aside as corrupt: never hand it one
  const state = await readSuitesFile(projectPath)
  if (state.kind === 'index' || state.kind === 'unknown') {
    const loaded = await loadIndex(projectPath)
    // Recorded files in a project Raider can't record into any more: show them, change nothing
    return canRecordFiles(layout) ? loaded : { ...loaded, mode: 'locked' }
  }
  const loaded = await loadSuites(projectPath)
  return { mode: 'legacy', index: [], ...loaded }
}

// Version 3: the index plus the tests' sidecars
async function loadIndex(projectPath: string): Promise<LoadedSuites> {
  try {
    const { suites: index, ...recovery } = await loadSuiteIndex(projectPath)
    const suites = await assembleFromIndex(projectPath, index)
    return { mode: 'files', suites, index, ...recovery }
  } catch (error) {
    if (error instanceof UnknownSuitesVersionError) {
      return { mode: 'locked', suites: [], index: [], recoveredFromCorrupt: false, tooNew: true }
    }
    if (error instanceof LegacySuitesFileError) {
      // Only if a version 2 file appeared after the migration looked: keep it as is
      const loaded = await loadSuites(projectPath)
      return { mode: 'legacy', index: [], ...loaded }
    }
    throw error
  }
}

async function loadProjectSuites(
  projectPath: string,
  layout: ProjectLayout
): Promise<LoadedSuites> {
  if (!canRecordFiles(layout)) return loadLegacy(projectPath, layout)
  let migrated: number
  try {
    ;({ migrated } = await migrateToProjectFiles(projectPath, layout))
  } catch (error) {
    // Nothing was lost: the old suites file is still in place, so stay on it and retry next time
    safeError('Recorded tests stay in the suites file for now:', error)
    const loaded = await loadLegacy(projectPath, layout)
    return { ...loaded, migration: { migrated: 0, postponed: true } }
  }
  const loaded = await loadIndex(projectPath)
  return migrated > 0 ? { ...loaded, migration: { migrated, postponed: false } } : loaded
}

async function activate(projectPath: string | null): Promise<ActivationResult> {
  try {
    appState.sessionUrl = null
    if (projectPath === null) {
      clearActiveProject()
    } else {
      // Load everything before swapping, so suites and projectPath always change together
      const settings = await readRecorderSettings(projectPath)
      const layout = await detectProjectLayout(projectPath)
      // Runs before projectPath is published, so no handler writes suites meanwhile
      const loaded = await loadProjectSuites(projectPath, layout)
      const { suites, recoveredFromCorrupt, backupSaved } = loaded
      appState.recorderSettings = settings
      appState.projectPath = projectPath
      appState.layout = layout
      appState.projectAutomation = layout.automation
      appState.projectFramework = layout.framework
      appState.suiteMode = loaded.mode
      appState.suiteIndex = new Map(loaded.index.map((entry) => [entry.id, entry]))
      appState.suites = new Map(suites.map((suite) => [suite.id, suite]))
      const send = (channel: string, ...args: unknown[]): void =>
        appState.mainWindow?.webContents.send(channel, ...args)
      send('suite-updated', suites)
      if (recoveredFromCorrupt) send('suites-recovered', { backupSaved })
      if (loaded.tooNew) send('suites-too-new')
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
