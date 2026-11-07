import path from 'path'
import type { RecentProjectEntry } from '../shared/types/recentProject'
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
  /** File → Open recent → a project: the path is one main stored itself */
  onOpenRecent: (projectPath: string) => void
  /** File → Open recent → Clear recent */
  onClearRecent: () => void
}

export interface MenuOptions {
  /** The shipped app hides Reload, Force reload and Developer tools */
  isPackaged: boolean
  /** Test › Record reads Stop & save while a recording runs */
  recording?: boolean
  /** File › Open recent, newest first */
  recentProjects?: RecentProjectEntry[]
}

/** Menu labels for the recent projects: the stored names, with the parent folder when two clash */
export function recentProjectLabels(projects: RecentProjectEntry[]): string[] {
  const counts = new Map<string, number>()
  for (const p of projects) counts.set(p.name, (counts.get(p.name) ?? 0) + 1)
  return projects.map((p) => {
    const parent = path.basename(path.dirname(p.path))
    const name = (counts.get(p.name) ?? 0) > 1 && parent ? `${p.name} (${parent})` : p.name
    return p.exists ? name : `${name} (${t('notFound')})`
  })
}

function openRecentSubmenu(
  actions: MenuActions,
  projects: RecentProjectEntry[]
): Electron.MenuItemConstructorOptions[] {
  if (projects.length === 0) return [{ label: t('noRecentProjects'), enabled: false }]
  const labels = recentProjectLabels(projects)
  return [
    ...projects.map((project, i) => ({
      label: labels[i],
      enabled: project.exists,
      click: (): void => actions.onOpenRecent(project.path)
    })),
    { type: 'separator' as const },
    { id: 'clear-recent', label: t('clearRecent'), click: (): void => actions.onClearRecent() }
  ]
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
      {
        id: 'open-recent',
        label: t('openRecent'),
        submenu: openRecentSubmenu(actions, options.recentProjects ?? [])
      },
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
        label: t(options.recording ? 'stopAndSave' : 'record'),
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
      command('docs', t('documentation')),
      command('recording-guide', t('recordingGuide')),
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

let installed: { actions: MenuActions; options: MenuOptions } | null = null

function setMenu(recording: boolean): void {
  if (!installed) return
  const { actions, options } = installed
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate(process.platform, actions, { ...options, recording })
    )
  )
}

/**
 * Test › Record reads Stop & save while recording. The whole menu is rebuilt and
 * re-installed (the native menu does not reliably follow a changed label); the item
 * keeps its id and accelerator. No-op before the menu is installed.
 */
export function setRecordingMenuState(recording: boolean): void {
  setMenu(recording)
}

/** File › Open recent follows the stored list; the menu is rebuilt like the recording state */
export function setRecentProjectsMenu(recentProjects: RecentProjectEntry[]): void {
  if (!installed) return
  installed.options.recentProjects = recentProjects
  setMenu(appState.recording)
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
  installed = { actions, options }
  setMenu(appState.recording)
}
