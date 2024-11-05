import { IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { SETTINGS_FILE } from '../../renderer/src/foundation/Constants'

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string
): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  try {
    const settingsFilePath = path.join(folderPath, SETTINGS_FILE)
    await fs.promises.access(settingsFilePath)

    return { success: true, filePath: settingsFilePath }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
