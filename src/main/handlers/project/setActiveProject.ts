import { appState } from '../appState'
import { DEFAULT_RECORDER_SETTINGS, readRecorderSettings } from '../config/projectSettings'
import type { RecorderSettings } from '@shared/types/recorderSettings'

/**
 * Makes the given project the active one (or clears it with null) and loads
 * its recorder settings. Single place to hook in per-project loading (e.g. suites).
 */
async function setActiveProject(
  projectPath: string | null
): Promise<{ success: boolean; settings?: RecorderSettings; error?: string }> {
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
