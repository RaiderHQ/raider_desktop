import type { BrowserWindow, IpcMain } from 'electron'

/** How long a close waits for the page to save its recording */
export const FLUSH_TIMEOUT_MS = 3000

interface CloseFlushOptions {
  /** Closes for real once the recording is saved; defaults to closing the window */
  close?: () => void
}

/**
 * Closing the window while recording first asks the page to save the recording
 * ('flush-recording'), then closes when it answers ('flush-recording-done') or
 * after FLUSH_TIMEOUT_MS, whichever comes first. The page reports whether it is
 * recording through 'recording-state'.
 */
export function installCloseFlush(
  win: BrowserWindow,
  ipc: IpcMain,
  { close = (): void => win.close() }: CloseFlushOptions = {}
): void {
  let recording = false
  let flushing = false

  const onState = (_event: unknown, active: unknown): void => {
    recording = active === true
  }
  ipc.on('recording-state', onState)

  win.on('close', (event) => {
    if (flushing) {
      // Already saving: this close waits for the same save
      event.preventDefault()
      return
    }
    if (!recording) return
    event.preventDefault()
    flushing = true

    const finish = (): void => {
      clearTimeout(timer)
      ipc.removeListener('flush-recording-done', finish)
      flushing = false
      recording = false
      if (!win.isDestroyed()) close()
    }
    const timer = setTimeout(finish, FLUSH_TIMEOUT_MS)
    ipc.on('flush-recording-done', finish)
    win.webContents.send('flush-recording')
  })

  win.on('closed', () => ipc.removeListener('recording-state', onState))
}
