import path from 'path'
import { BrowserWindow, dialog, type WebContents } from 'electron'

/** Builds the confirm step for accept-baseline; the dialog is shown on the sender's window. */
export const makeBaselineConfirm =
  (sender: WebContents) =>
  async (baselinePath: string, actualName?: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(sender)
    if (!win) return false
    const name = baselinePath
      .split('/')
      .slice(3)
      .join('/')
      .replace(/\.png$/, '')
    // Basename only: the renderer-supplied path must not leak an absolute location.
    const detail = actualName
      ? `${baselinePath}\n\nNew screenshot: ${path.basename(actualName.replace(/\\/g, '/'))}`
      : baselinePath
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Accept as baseline', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Accept this screenshot as the baseline for "${name}"?`,
      detail
    })
    return response === 0
  }
