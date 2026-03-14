import { writeFile, access } from 'fs/promises'
import { constants } from 'fs'
import { IpcMainInvokeEvent } from 'electron'
import { validateFilePath } from '../../utils/validatePath'
import { safeError } from '../../utils/safeLog'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string,
  newContent: string
): Promise<{ success: boolean; error?: string; output?: string }> => {
  try {
    if (typeof newContent !== 'string') {
      throw new Error('Invalid content: Must be a string')
    }

    const { valid, resolved } = validateFilePath(filePath)
    if (!valid) {
      return { success: false, error: 'Access denied: path is outside allowed directories' }
    }

    // Check if the file exists
    await access(resolved, constants.F_OK)

    // Write the new content to the file
    await writeFile(resolved, newContent, 'utf-8')

    return { success: true }
  } catch (error) {
    safeError('Error editing file:', error)
    if (error instanceof Error) {
      if (error.message.includes('EACCES')) {
        return {
          success: false,
          error: 'permission.denied.save'
        }
      }
      if (error.message.includes('ENOENT')) {
        return { success: false, error: 'File does not exist' }
      }
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
