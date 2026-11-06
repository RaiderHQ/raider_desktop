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
  /** Runs when the close is cancelled (Cancel, or Save timing out), so a held quit does not carry on later */
  onCancel?: () => void
  /** How long Save waits for the page to report a clean document */
  timeoutMs?: number
}

/**
 * The page reports its open document ('document-edited'); the window shows the
 * edited dot. Closing an edited window asks to save first: Save sends the save
 * command and closes once the page reports clean (or stays open after timeoutMs).
 * A close another listener already holds (the recording flush) is not the guard's:
 * install the guard after it so its close listener runs second.
 */
export function installDocumentEdited(
  win: BrowserWindow,
  ipc: IpcMain,
  {
    dialog: dlg = dialog,
    close = (): void => win.close(),
    onCancel = (): void => {},
    timeoutMs = 5000
  }: DocumentEditedOptions = {}
): { state: () => DocumentEditedState; markClean: () => void } {
  let current: DocumentEditedState = { edited: false, name: '' }
  let busy = false
  let afterReport: (() => void) | null = null
  // The pending Save's timer, so a window that goes away mid-wait takes it along
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const onEdited = (event: { sender?: unknown }, flag: unknown, name: unknown): void => {
    if (win.isDestroyed() || event?.sender !== win.webContents) return
    current = {
      edited: flag === true,
      name: typeof name === 'string' ? name.slice(0, 200) : ''
    }
    win.setDocumentEdited(current.edited)
    if (!current.edited) afterReport?.()
  }
  ipc.on('document-edited', onEdited)

  win.on('close', (event) => {
    // Held by another listener (the recording flush owns closes while recording)
    if (event.defaultPrevented) return
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
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = null
        afterReport = null
        busy = false
      }
      // The page never reported clean: the window stays open, as after Cancel
      saveTimer = setTimeout(() => {
        finish()
        onCancel()
      }, timeoutMs)
      afterReport = (): void => {
        finish()
        if (!win.isDestroyed()) close()
      }
      win.webContents.send('menu-command', 'save')
    } else {
      busy = false
      onCancel()
    }
  })

  win.on('closed', () => {
    ipc.removeListener('document-edited', onEdited)
    // Gone mid-Save: nothing is left to close, and a held quit must not be cancelled
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    afterReport = null
    busy = false
  })

  const markClean = (): void => {
    current = { ...current, edited: false }
  }

  return { state: () => current, markClean }
}
