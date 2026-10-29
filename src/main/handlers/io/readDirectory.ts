import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { FileNode } from '@foundation/Types/fileNode'

const EXCLUDED_FILES: string[] = ['.DS_Store', 'Thumbs.db', 'desktop.ini']

// Raider's own records (.raider) are not project files; hidden at the folder that was asked for
const RAIDER_DIR = '.raider'

async function readFolder(folderPath: string, isNested: boolean): Promise<FileNode[]> {
  const contents = await fs.promises.readdir(folderPath, { withFileTypes: true })

  const nodes = await Promise.all(
    contents.map(async (content) => {
      if (EXCLUDED_FILES.includes(content.name) || (!isNested && content.name === RAIDER_DIR)) {
        return null
      }

      const entryPath = path.join(folderPath, content.name)
      if (content.isDirectory()) {
        return {
          name: content.name,
          isDirectory: true,
          type: 'folder' as const,
          children: await readFolder(entryPath, true)
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

// The IPC channel takes only the path: the nesting flag stays internal
const readDirectory = (_event: IpcMainInvokeEvent, folderPath: string): Promise<FileNode[]> =>
  readFolder(folderPath, false)

export default readDirectory
