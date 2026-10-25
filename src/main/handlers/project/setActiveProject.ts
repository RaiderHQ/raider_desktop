import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import type { RecorderSettings } from '@shared/types/recorderSettings'

/**
 * Makes the given project the active one (or clears it with null) and loads
 * its recorder settings. Single place to hook in per-project loading (e.g. suites).
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
    } else {
      appState.recorderSettings = await readRecorderSettings(projectPath)
      appState.projectPath = projectPath
    }
    return { success: true, settings: appState.recorderSettings }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default setActiveProject
