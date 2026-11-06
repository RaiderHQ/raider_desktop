import type { BrowserWindow, IpcMain } from 'electron'

export interface DocumentEditedState {
  edited: boolean
  name: string
}

/** The page reports its open document ('document-edited'); the window shows the edited dot. */
export function installDocumentEdited(
  win: BrowserWindow,
  ipc: IpcMain
): { state: () => DocumentEditedState } {
  let current: DocumentEditedState = { edited: false, name: '' }

  const onEdited = (_event: unknown, flag: unknown, name: unknown): void => {
    current = {
      edited: flag === true,
      name: typeof name === 'string' ? name.slice(0, 200) : ''
    }
    if (!win.isDestroyed()) win.setDocumentEdited(current.edited)
  }
  ipc.on('document-edited', onEdited)
  win.on('closed', () => ipc.removeListener('document-edited', onEdited))

  return { state: () => current }
}
