import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { FileNode } from '@foundation/Types/fileNode'

const EXCLUDED_FILES: string[] = ['.DS_Store', 'Thumbs.db', 'desktop.ini']

const readDirectory = async (
  _event: IpcMainInvokeEvent,
  folderPath: string
): Promise<FileNode[]> => {
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
