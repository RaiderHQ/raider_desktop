import fs from 'fs'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (
  _event: IpcMainInvokeEvent,
  filePath: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Validate the file path
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid filePath: Must be a non-empty string')
    }

    // Validate the content
    if (typeof newContent !== 'string') {
      throw new Error('Invalid content: Must be a string')
    }

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist')
    }

    // Write the new content to the file
    fs.writeFileSync(filePath, newContent, 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('Error editing file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
