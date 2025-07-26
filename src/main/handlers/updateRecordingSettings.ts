import { appState } from './appState'

interface RecordingSettings {
  implicitWait: number
  explicitWait: number
}

const handler = (settings: RecordingSettings): { success: boolean; error?: string } => {
  try {
    appState.recordingSettings.implicitWait = settings.implicitWait
    appState.recordingSettings.explicitWait = settings.explicitWait
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
