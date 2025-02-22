import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

const readImage = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => {
  try {
    const extension = path.extname(filePath)
    const fileBuffer = fs.readFileSync(filePath)
    const base64Data = fileBuffer.toString('base64')
    return { success: true, data: base64Data, fileExt: extension }
  } catch (error) {
    console.error('Error reading image file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

export default readImage
