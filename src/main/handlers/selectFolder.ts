import { dialog, IpcMainInvokeEvent } from 'electron'

const selectFolder = async (_event: IpcMainInvokeEvent, title: string): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title
  })

  return result.canceled ? null : result.filePaths[0]
}

export default selectFolder
