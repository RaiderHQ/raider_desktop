import path from 'path'

// Since Electron 43 a file dialog without a defaultPath always opens in Downloads,
// and the OS no longer brings back the last folder used. The app keeps that folder
// itself (for this session) so open dialogs start where the user last picked from.
let lastDirectory: string | undefined

/** The folder the last open dialog picked from, or undefined before the first pick. */
export const lastDialogDirectory = (): string | undefined => lastDirectory

/** Remembers the folder that holds the first picked path; an empty pick keeps the old one. */
export const rememberDialogPick = (filePaths: readonly string[]): void => {
  if (filePaths.length > 0) lastDirectory = path.dirname(filePaths[0])
}

/** For tests. */
export const resetDialogDirectory = (): void => {
  lastDirectory = undefined
}
