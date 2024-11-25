import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (
  _event: IpcMainInvokeEvent,
  projectFolderPath: string
): Promise<{ success: boolean; isMobileProject?: boolean; error?: string }> => {
  try {
    // Define the configuration file name
    const configFileName = 'config/capabilities.yml'
    const configFilePath = path.join(projectFolderPath, configFileName)

    // Check if the configuration file exists
    const isMobileProject = fs.existsSync(configFilePath)

    return { success: true, isMobileProject }
  } catch (error) {
    console.error('Error checking configuration file:', error)
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Unknown error' }
  }
}

export default handler
