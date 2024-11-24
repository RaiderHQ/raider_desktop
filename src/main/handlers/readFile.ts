import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => {
  try {
    const extension = path.extname(filePath)

    // Read the file content
    const data = fs.readFileSync(filePath, 'utf-8')
    return { success: true, data, fileExt: extension }
  } catch (error) {
    console.error('Error reading file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
