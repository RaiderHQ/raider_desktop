import { setRecordingSettings } from './appState'

interface RecordingSettings {
  implicitWait: number
  explicitWait: number
}

/**
 * Receives recording settings from the renderer process and updates the app state.
 * @param settings - An object containing recording settings.
 * @returns An object indicating the success of the operation.
 */
function updateRecordingSettings(settings: RecordingSettings): { success: boolean } {
  setRecordingSettings(settings)
  console.log(`[MainProcess] Recording settings updated:`, settings)
  return { success: true }
}

export default updateRecordingSettings
