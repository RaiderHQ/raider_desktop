import { execSync } from 'child_process'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (
  _event: IpcMainInvokeEvent,
  folderPath: string,
  projectName: string
): Promise<{ success: boolean; output?: string; error?: string }> => {
  try {
    if (!projectName.trim()) {
      throw new Error('Project name is required.')
    }

    if (!folderPath.trim()) {
      throw new Error('Folder path is required.')
    }

    // Construct the command
    const command = `raider new "${projectName}"`
    const options = { cwd: folderPath } // Set the working directory

    // Execute the command synchronously
    const output = execSync(command, options).toString()

    return { success: true, output }
  } catch (error) {
    console.error('Error running ruby raider command:', error)

    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
};

export default handler
