import { readFile } from 'fs/promises'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const readImage = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => {
  try {
    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    const extension = path.extname(resolved)
    const fileBuffer = await readFile(resolved)
    const base64Data = fileBuffer.toString('base64')
    return { success: true, data: base64Data, fileExt: extension }
  } catch (error) {
    safeError('Error reading image file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

export default readImage
