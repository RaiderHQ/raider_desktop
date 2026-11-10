import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import { detectProjectLayout } from './projectLayout'
import { loadRecordedTests } from '../tests/loadTests'
import { safeError, safeWarn } from '../../utils/safeLog'
import { migrateRecordedTests } from '../tests/migrateRecordedTests'
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

type ActivationListener = (projectPath: string | null) => void
const activationListeners = new Set<ActivationListener>()

/**
 * Calls `listener` with the project each time one opens, and with null when it closes or
 * fails to open. Returns the unsubscribe.
 */
export function onActiveProjectChange(listener: ActivationListener): () => void {
  activationListeners.add(listener)
  return (): void => {
    activationListeners.delete(listener)
  }
}

const announce = (projectPath: string | null): void => {
  for (const listener of Array.from(activationListeners)) {
    // A listener's failure must not fail (or skip the others in) a good activation
    try {
      listener(projectPath)
    } catch (error) {
      safeWarn('Project change listener failed:', error instanceof Error ? error.message : error)
    }
  }
}

function clearActiveProject(): void {
  appState.projectPath = null
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  appState.layout = null
  appState.projectAutomation = null
  appState.projectFramework = null
  appState.tests = new Map()
  appState.mainWindow?.webContents.send('tests-updated', [])
  announce(null)
}

async function activate(projectPath: string | null): Promise<ActivationResult> {
  try {
    appState.sessionUrl = null
    // A flow recording belongs to the project it started in
    appState.recordingMode = 'test'
    if (projectPath === null) {
      clearActiveProject()
    } else {
      // Load everything before swapping, so the tests and projectPath always change together
      const settings = await readRecorderSettings(projectPath)
      const layout = await detectProjectLayout(projectPath)
      // Specs written in an older codegen shape are rewritten first, so the tests load current
      await migrateRecordedTests(projectPath, layout).catch((error: unknown) => {
        safeError('Could not update the recorded tests:', error)
      })
      // Runs before projectPath is published, so no handler writes tests meanwhile
      const tests = await loadRecordedTests(projectPath).catch((error: unknown) => {
        // The project can't open, but nothing is lost: the tests are spec files and sidecars
        safeError('Could not load the recorded tests:', error)
        throw error
      })
      appState.recorderSettings = settings
      appState.projectPath = projectPath
      appState.layout = layout
      appState.projectAutomation = layout.automation
      appState.projectFramework = layout.framework
      appState.tests = new Map(tests.map((test) => [test.id, test]))
      const send = (channel: string, ...args: unknown[]): void =>
        appState.mainWindow?.webContents.send(channel, ...args)
      send('tests-updated', Array.from(appState.tests.values()))
      announce(projectPath)
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
