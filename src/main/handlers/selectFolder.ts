import { dialog, IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { SETTINGS_FILE } from '../../renderer/src/foundation/Constants'

const selectFolder = async (_event: IpcMainInvokeEvent, title: string): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title
  })

  if (result.canceled) {
    return null
  }

  const folderPath = result.filePaths[0]
  const settingsFilePath = path.join(folderPath, SETTINGS_FILE)
  try {
    await fs.promises.access(settingsFilePath)
  } catch {
    throw new Error(`Settings file not found at ${settingsFilePath}`)
  }

  return folderPath
}

export default selectFolder
