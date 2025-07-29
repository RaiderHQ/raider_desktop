import { shell } from 'electron'

const handler = (folderPath: string): void => {
  shell.showItemInFolder(folderPath)
}

export default handler
