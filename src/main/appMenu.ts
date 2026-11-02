import { Menu } from 'electron'
import { englishText } from '../shared/describeStepEnglish'

/**
 * The app's menu bar: the standard menus plus File → Open trace…, which opens a
 * trace the user picks in a main-side dialog (the renderer never sends a path).
 */
export function buildAppMenuTemplate(
  platform: NodeJS.Platform,
  onOpenTrace: () => void
): Electron.MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  const file: Electron.MenuItemConstructorOptions = {
    label: englishText('traceViewer.menu.file'),
    submenu: [
      {
        id: 'open-trace',
        label: englishText('traceViewer.menu.openTrace'),
        click: () => onOpenTrace()
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]
  }
  return [
    ...(isMac ? [{ role: 'appMenu' } as const] : []),
    file,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
}

/**
 * A menu action for the main window that does nothing while there is no live
 * window (on macOS the app stays open after its window closes).
 */
export function withLiveWindow(
  getWindow: () => Electron.BrowserWindow | null | undefined,
  action: (win: Electron.BrowserWindow) => void
): () => void {
  return () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) action(win)
  }
}

export function installAppMenu(onOpenTrace: () => void): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildAppMenuTemplate(process.platform, onOpenTrace))
  )
}
