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

export function installAppMenu(onOpenTrace: () => void): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildAppMenuTemplate(process.platform, onOpenTrace))
  )
}
