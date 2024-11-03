import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  data: object
): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  try {
    const filePath = path.join(folderPath, 'raider.config.json')
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

    return { success: true, filePath }
  } catch (error) {
    console.error('Error creating settings file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
