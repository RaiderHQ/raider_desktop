import { dialog } from 'electron'
import type { BrowserWindow, IpcMain } from 'electron'
import { englishText } from '../../shared/describeStepEnglish'

export interface DocumentEditedState {
  edited: boolean
  name: string
}

interface DocumentEditedOptions {
  dialog?: Pick<typeof dialog, 'showMessageBoxSync'>
  /** Closes for real once the choice is made; defaults to closing the window */
  close?: () => void
  /** How long Save waits for the page to report a clean document */
  timeoutMs?: number
}

/**
 * The page reports its open document ('document-edited'); the window shows the
 * edited dot. Closing an edited window asks to save first: Save sends the save
 * command and closes once the page reports clean (or stays open after timeoutMs).
 */
export function installDocumentEdited(
  win: BrowserWindow,
  ipc: IpcMain,
  {
    dialog: dlg = dialog,
    close = (): void => win.close(),
    timeoutMs = 5000
  }: DocumentEditedOptions = {}
): { state: () => DocumentEditedState } {
  let current: DocumentEditedState = { edited: false, name: '' }
  let busy = false
  let afterReport: (() => void) | null = null

  const onEdited = (_event: unknown, flag: unknown, name: unknown): void => {
    current = {
      edited: flag === true,
      name: typeof name === 'string' ? name.slice(0, 200) : ''
    }
    if (!win.isDestroyed()) win.setDocumentEdited(current.edited)
    if (!current.edited) afterReport?.()
  }
  ipc.on('document-edited', onEdited)

  win.on('close', (event) => {
    if (busy) {
      event.preventDefault()
      return
    }
    if (!current.edited) return
    event.preventDefault()
    busy = true

    const choice = dlg.showMessageBoxSync(win, {
      type: 'warning',
      message: englishText('closeGuard.message', { name: current.name }),
      buttons: [
        englishText('closeGuard.save'),
        englishText('closeGuard.discard'),
        englishText('closeGuard.cancel')
      ],
      defaultId: 0,
      cancelId: 2
    })

    if (choice === 1) {
      current = { ...current, edited: false }
      busy = false
      close()
    } else if (choice === 0) {
      const finish = (): void => {
        clearTimeout(timer)
        afterReport = null
        busy = false
      }
      const timer = setTimeout(finish, timeoutMs)
      afterReport = (): void => {
        finish()
        if (!win.isDestroyed()) close()
      }
      win.webContents.send('menu-command', 'save')
    } else {
      busy = false
    }
  })

  win.on('closed', () => ipc.removeListener('document-edited', onEdited))

  return { state: () => current }
}
