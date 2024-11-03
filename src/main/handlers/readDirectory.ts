import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { SETTINGS_FILE } from '../../renderer/src/foundation/Constants'
import { FileNode } from '@foundation/Types/fileNode'

const EXCLUDED_FILES: string[] = ['.DS_Store', 'Thumbs.db', 'desktop.ini']

const readDirectory = async (
  _event: IpcMainInvokeEvent,
  folderPath: string
): Promise<FileNode[]> => {
  const settingsFilePath = path.join(folderPath, SETTINGS_FILE)
  try {
    await fs.promises.access(settingsFilePath)
  } catch {
    throw new Error(`Settings file not found at ${settingsFilePath}`)
  }

  const contents = await fs.promises.readdir(folderPath, { withFileTypes: true })

  const nodes = await Promise.all(
    contents.map(async (content) => {
      if (EXCLUDED_FILES.includes(content.name)) {
        return null
      }

      const entryPath = path.join(folderPath, content.name)
      if (content.isDirectory()) {
        return {
          name: content.name,
          isDirectory: true,
          type: 'folder' as const,
          children: await readDirectory(_event, entryPath)
        }
      }

      return {
        name: content.name,
        isDirectory: false,
        type: 'file' as const,
        path: entryPath
      }
    })
  )

  return nodes.filter((node) => node !== null) as FileNode[]
}

export default readDirectory
