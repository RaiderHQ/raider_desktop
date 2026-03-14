import { copyFile, access } from 'fs/promises'
import { constants } from 'fs'
import { dirname, join, basename, extname } from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<{ success: boolean; newPath?: string; error?: string }> => {
  try {
    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    await access(resolved, constants.F_OK)

    const dir = dirname(resolved)
    const ext = extname(resolved)
    const base = basename(resolved, ext)
    let newPath = join(dir, `${base}_copy${ext}`)
    let counter = 2

    // Find a unique name if _copy already exists
    while (true) {
      try {
        await access(newPath, constants.F_OK)
        newPath = join(dir, `${base}_copy${counter}${ext}`)
        counter++
      } catch {
        break // File doesn't exist, we can use this name
      }
    }

    const newValidation = validateFilePath(newPath)
    if (!newValidation.valid) {
      return { success: false, error: 'Access denied: new path is outside allowed directories' }
    }

    await copyFile(resolved, newValidation.resolved)

    return { success: true, newPath: newValidation.resolved }
  } catch (error) {
    safeError('Error duplicating file:', error)
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
