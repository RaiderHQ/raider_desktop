import { Menu } from 'electron'
import { englishText } from '../shared/describeStepEnglish'
import { SHORTCUTS, type ShortcutId } from '../shared/shortcuts'
import { appState } from './handlers/appState'

/** What the menu bar can ask the renderer to do; the renderer checks the value before acting. */
export type MenuCommand =
  | 'new-project'
  | 'open-project'
  | 'save'
  | 'record'
  | 'stop'
  | 'run'
  | 'new-test'
  | 'open-file'
  | 'how-it-works'
  | 'shortcuts'
  | 'docs'
  | 'recording-guide'

export interface MenuActions {
  /** File → Open trace…: a main-side dialog; the renderer never sends a path */
  onOpenTrace: () => void
  /** Every other command goes to the renderer, which acts through its existing flows */
  onCommand: (command: MenuCommand) => void
}

export interface MenuOptions {
  /** The shipped app hides Reload, Force reload and Developer tools */
  isPackaged: boolean
}

const t = (key: string): string => englishText(`appMenu.${key}`)

/**
 * The app's menu bar: File (projects, trace, save), Edit, Test (record, run), View,
 * Window and Help. Commands reach the renderer as a constant string; nothing else.
 */
export function buildAppMenuTemplate(
  platform: NodeJS.Platform,
  actions: MenuActions,
  options: MenuOptions
): Electron.MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  const command = (
    id: MenuCommand,
    label: string,
    shortcut?: ShortcutId
  ): Electron.MenuItemConstructorOptions => ({
    id,
    label,
    accelerator: shortcut ? SHORTCUTS[shortcut].accelerator : undefined,
    click: () => actions.onCommand(id)
  })

  const file: Electron.MenuItemConstructorOptions = {
    label: t('file'),
    submenu: [
      command('new-project', t('newProject'), 'new-project'),
      command('open-project', t('openProject'), 'open-project'),
      { type: 'separator' },
      { id: 'open-trace', label: t('openTrace'), click: () => actions.onOpenTrace() },
      { type: 'separator' },
      command('save', t('save'), 'save'),
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]
  }
  const test: Electron.MenuItemConstructorOptions = {
    label: t('test'),
    submenu: [
      {
        id: 'record',
        label: t('record'),
        accelerator: SHORTCUTS.record.accelerator,
        // Decided at click time from what the page last reported, not from the label
        click: () => actions.onCommand(appState.recording ? 'stop' : 'record')
      },
      command('run', t('run'), 'run'),
      { type: 'separator' },
      command('new-test', t('newTest'), 'new-test'),
      command('open-file', t('openFile'), 'open-file')
    ]
  }
  // Reload would take Cmd+R from Run: only the empty string clears a role's default accelerator
  const developer: Electron.MenuItemConstructorOptions[] = options.isPackaged
    ? []
    : [
        { role: 'reload', accelerator: '' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' }
      ]
  const view: Electron.MenuItemConstructorOptions = {
    label: t('view'),
    submenu: [
      ...developer,
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
  const help: Electron.MenuItemConstructorOptions = {
    ...(isMac ? { role: 'help' as const } : {}),
    label: t('help'),
    submenu: [
      command('how-it-works', t('howItWorks')),
      command('shortcuts', t('keyboardShortcuts'), 'shortcuts')
    ]
  }
  return [
    ...(isMac ? [{ role: 'appMenu' } as const] : []),
    file,
    { role: 'editMenu' },
    test,
    view,
    { role: 'windowMenu' },
    help
  ]
}

/** Relabels Test › Record to Stop & save while recording; only the label changes. No-op without a menu. */
export function setRecordingMenuState(
  recording: boolean,
  menu: Menu | null = Menu.getApplicationMenu()
): void {
  const item = menu?.getMenuItemById('record')
  if (item) item.label = t(recording ? 'stopAndSave' : 'record')
}

/**
 * A menu action for the main window that does nothing while there is no live
 * window (on macOS the app stays open after its window closes).
 */
export function withLiveWindow<Args extends unknown[]>(
  getWindow: () => Electron.BrowserWindow | null | undefined,
  action: (win: Electron.BrowserWindow, ...args: Args) => void
): (...args: Args) => void {
  return (...args: Args) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) action(win, ...args)
  }
}

export function installAppMenu(actions: MenuActions, options: MenuOptions): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildAppMenuTemplate(process.platform, actions, options))
  )
}
