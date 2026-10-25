import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import { loadSuites } from '../suitePersistence'
import type { RecorderSettings } from '@shared/types/recorderSettings'

/**
 * Makes the given project the active one (or clears it with null) and loads
 * its recorder settings and suites. Single place to hook in per-project loading.
 */
type ActivationResult = { success: boolean; settings?: RecorderSettings; error?: string }

// Latest activation, so readers can wait for it and activations apply in call order
let activation: Promise<unknown> = Promise.resolve()

function setActiveProject(projectPath: string | null): Promise<ActivationResult> {
  const result = activation.then(() => activate(projectPath))
  activation = result
  return result
}

/** Current recorder settings, once any in-flight project activation has finished. */
export async function getRecorderSettings(): Promise<RecorderSettings> {
  await activation
  return appState.recorderSettings
}

async function activate(projectPath: string | null): Promise<ActivationResult> {
  try {
    appState.sessionUrl = null
    if (projectPath === null) {
      appState.projectPath = null
      appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
      appState.suites = new Map()
      appState.mainWindow?.webContents.send('suite-updated', [])
    } else {
      // Load everything first so a failure leaves the previous project untouched
      const settings = await readRecorderSettings(projectPath)
      const { suites, recoveredFromCorrupt } = await loadSuites(projectPath)
      appState.recorderSettings = settings
      appState.projectPath = projectPath
      appState.suites = new Map(suites.map((suite) => [suite.id, suite]))
      appState.mainWindow?.webContents.send('suite-updated', suites)
      if (recoveredFromCorrupt) appState.mainWindow?.webContents.send('suites-recovered')
    }
    return { success: true, settings: appState.recorderSettings }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default setActiveProject
