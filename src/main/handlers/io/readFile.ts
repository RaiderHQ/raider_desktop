import { readFile as fsReadFile } from 'fs/promises'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }> => {
  try {
    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    const extension = path.extname(resolved)
    const data = await fsReadFile(resolved, 'utf-8')
    return { success: true, data, fileExt: extension }
  } catch (error) {
    safeError('Error reading file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
