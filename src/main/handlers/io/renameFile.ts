import { rename, access } from 'fs/promises'
import { constants } from 'fs'
import { dirname, join } from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string,
  newName: string
): Promise<{ success: boolean; newPath?: string; error?: string }> => {
  try {
    if (!newName || !newName.trim()) {
      return { success: false, error: 'New name cannot be empty' }
    }

    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    await access(resolved, constants.F_OK)

    const dir = dirname(resolved)
    const newPath = join(dir, newName.trim())

    const newValidation = validateFilePath(newPath)
    if (!newValidation.valid) {
      return { success: false, error: 'Access denied: new path is outside allowed directories' }
    }

    await rename(resolved, newValidation.resolved)

    return { success: true, newPath: newValidation.resolved }
  } catch (error) {
    safeError('Error renaming file:', error)
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
