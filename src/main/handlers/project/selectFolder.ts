import { dialog, IpcMainInvokeEvent } from 'electron'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'

const selectFolder = async (_event: IpcMainInvokeEvent, title: string): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    defaultPath: lastDialogDirectory(),
    properties: ['openDirectory', 'createDirectory'],
    title
  })
  if (!result.canceled) rememberDialogPick(result.filePaths)

  return result.canceled ? null : result.filePaths[0]
}

export default selectFolder
