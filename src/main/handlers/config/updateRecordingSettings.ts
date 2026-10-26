import { appState } from '../appState'
import { writeRecorderSettings } from './projectSettings'
import type { RecorderSettings } from '@shared/types/recorderSettings'

type SettingsPatch = Partial<
  Pick<RecorderSettings, 'implicitWait' | 'explicitWait' | 'selectorPriority'>
>

const handler = async (patch: SettingsPatch): Promise<{ success: boolean; error?: string }> => {
  const projectPath = appState.projectPath
  if (!projectPath) return { success: false, error: 'No project open' }
  try {
    await writeRecorderSettings(projectPath, patch)
    appState.recorderSettings = { ...appState.recorderSettings, ...patch }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
