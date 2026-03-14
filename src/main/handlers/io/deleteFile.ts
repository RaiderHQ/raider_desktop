import { unlink, access, rm, stat } from 'fs/promises'
import { constants } from 'fs'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    await access(resolved, constants.F_OK)

    const info = await stat(resolved)
    if (info.isDirectory()) {
      await rm(resolved, { recursive: true })
    } else {
      await unlink(resolved)
    }

    return { success: true }
  } catch (error) {
    safeError('Error deleting file:', error)
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        return { success: false, error: 'File does not exist' }
      }
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

export default handler
