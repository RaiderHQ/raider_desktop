import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockMenu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  setApplicationMenu: vi.fn()
}))
vi.mock('electron', () => ({ Menu: mockMenu }))

import {
  buildAppMenuTemplate,
  installAppMenu,
  setRecordingMenuState,
  setRecentProjectsMenu,
  withLiveWindow
} from '../../src/main/appMenu'
import { SHORTCUTS } from '../../src/shared/shortcuts'
import { appState } from '../../src/main/handlers/appState'

type Item = Electron.MenuItemConstructorOptions
const menu = (template: Item[], label: string): Item =>
  template.find((item) => item.label === label)!
const items = (template: Item[], label: string): Item[] => menu(template, label).submenu as Item[]
const actions = (): {
  onOpenTrace: ReturnType<typeof vi.fn>
  onCommand: ReturnType<typeof vi.fn>
  onOpenRecent: ReturnType<typeof vi.fn>
  onClearRecent: ReturnType<typeof vi.fn>
} => ({
  onOpenTrace: vi.fn(),
  onCommand: vi.fn(),
  onOpenRecent: vi.fn(),
  onClearRecent: vi.fn()
})
const recent = [
  { path: '/work/shop', name: 'shop', lastOpened: 2, exists: true, isRaider: true },
  { path: '/work/gone', name: 'gone', lastOpened: 1, exists: false, isRaider: false }
]
const build = (platform: NodeJS.Platform, isPackaged = true): Item[] =>
  buildAppMenuTemplate(platform, actions(), { isPackaged })

describe('buildAppMenuTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives macOS the app menu, File, Edit, Test, View, Window and Help', () => {
    expect(build('darwin').map((item) => item.role ?? item.label)).toEqual([
      'appMenu',
      'File',
      'editMenu',
      'Test',
      'View',
      'windowMenu',
      'help'
    ])
  })

  it('File has New project, Open project, Open recent, Open trace and Save, then Close', () => {
    const file = items(build('darwin'), 'File')
    expect(file.map((item) => item.id ?? item.type ?? item.role)).toEqual([
      'new-project',
      'open-project',
      'open-recent',
      'separator',
      'open-trace',
      'separator',
      'save',
      'separator',
      'close'
    ])
    expect(file[0]).toMatchObject({ label: 'New project…', accelerator: 'CmdOrCtrl+Shift+N' })
    expect(file[1]).toMatchObject({ label: 'Open project…', accelerator: 'CmdOrCtrl+O' })
    expect(file[2]).toMatchObject({ label: 'Open recent' })
    expect(file[4]).toMatchObject({ label: 'Open trace…' })
    expect(file[6]).toMatchObject({ label: 'Save', accelerator: 'CmdOrCtrl+S' })
  })

  it('Open recent lists the stored projects by name, a missing folder disabled, then Clear recent', () => {
    const a = actions()
    const file = items(
      buildAppMenuTemplate('darwin', a, { isPackaged: true, recentProjects: recent }),
      'File'
    )
    const submenu = file[2].submenu as Item[]
    expect(submenu.map((item) => item.label ?? item.type)).toEqual([
      'shop',
      'gone (not found)',
      'separator',
      'Clear recent'
    ])
    expect(submenu[0].enabled).not.toBe(false)
    expect(submenu[1].enabled).toBe(false)
    ;(submenu[0].click as () => void)()
    expect(a.onOpenRecent).toHaveBeenCalledWith('/work/shop')
    ;(submenu[3].click as () => void)()
    expect(a.onClearRecent).toHaveBeenCalled()
    expect(a.onCommand).not.toHaveBeenCalled()
  })

  it('Open recent with nothing stored is a single disabled line', () => {
    const submenu = items(build('darwin'), 'File')[2].submenu as Item[]
    expect(submenu.map((item) => item.label)).toEqual(['No recent projects'])
    expect(submenu[0].enabled).toBe(false)
  })

  it('labels come from the folder itself, with & escaped on Windows and a fallback for a root', () => {
    const stored = [
      { path: '/work/A&B', name: 'stale name', lastOpened: 2, exists: true, isRaider: true },
      { path: '/', name: '', lastOpened: 1, exists: true, isRaider: true }
    ]
    const labels = (platform: NodeJS.Platform): string[] =>
      (
        items(
          buildAppMenuTemplate(platform, actions(), { isPackaged: true, recentProjects: stored }),
          'File'
        )[2].submenu as Item[]
      )
        .slice(0, 2)
        .map((item) => item.label as string)
    expect(labels('darwin')).toEqual(['A&B', '/'])
    expect(labels('win32')).toEqual(['A&&B', '/'])
  })

  it('two folders with the same name show their parent folder too', () => {
    const twins = [
      { path: '/work/a/shop', name: 'shop', lastOpened: 2, exists: true, isRaider: true },
      { path: '/work/b/shop', name: 'shop', lastOpened: 1, exists: true, isRaider: true }
    ]
    const submenu = items(
      buildAppMenuTemplate('darwin', actions(), { isPackaged: true, recentProjects: twins }),
      'File'
    )[2].submenu as Item[]
    expect(submenu.slice(0, 2).map((item) => item.label)).toEqual(['shop (a)', 'shop (b)'])
  })

  it('Test has Record, Run, New test and View file', () => {
    const test = items(build('darwin'), 'Test')
    expect(test.map((item) => item.id ?? item.type)).toEqual([
      'record',
      'run',
      'separator',
      'new-test',
      'open-file'
    ])
    expect(test[0]).toMatchObject({ label: 'Record', accelerator: 'CmdOrCtrl+Shift+R' })
    expect(test[1]).toMatchObject({ label: 'Run', accelerator: 'CmdOrCtrl+R' })
  })

  it('New test is Cmd+N and New project Cmd+Shift+N', () => {
    const all = build('darwin').flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    expect(all.find((i) => i.id === 'new-test')!.accelerator).toBe('CmdOrCtrl+N')
    expect(all.find((i) => i.id === 'new-project')!.accelerator).toBe('CmdOrCtrl+Shift+N')
  })

  it('every accelerator comes from the shared table', () => {
    const template = build('darwin', false)
    const table = new Set(Object.values(SHORTCUTS).map((s) => s.accelerator))
    const all = template.flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    for (const item of all) {
      if (item.id && item.accelerator && item.id in SHORTCUTS)
        expect(item.accelerator).toBe(SHORTCUTS[item.id as keyof typeof SHORTCUTS].accelerator)
    }
    const literals = JSON.stringify(template).match(/CmdOrCtrl\+[^"]*/g) ?? []
    for (const literal of literals) expect(table.has(literal)).toBe(true)
  })

  describe('Record / Stop & save', () => {
    afterEach(() => {
      appState.recording = false
    })

    const installedRecord = (): Item => {
      const template = mockMenu.buildFromTemplate.mock.calls.at(-1)![0] as Item[]
      return items(template, 'Test').find((i) => i.id === 'record')!
    }

    it('rebuilds File › Open recent when the stored list changes (U8)', () => {
      installAppMenu(actions(), { isPackaged: true })
      const openRecent = (): Item[] => {
        const template = mockMenu.buildFromTemplate.mock.calls.at(-1)![0] as Item[]
        return items(template, 'File').find((i) => i.id === 'open-recent')!.submenu as Item[]
      }
      expect(openRecent().map((i) => i.label)).toEqual(['No recent projects'])
      setRecentProjectsMenu(recent)
      expect(openRecent().map((i) => i.label ?? i.type)).toEqual([
        'shop',
        'gone (not found)',
        'separator',
        'Clear recent'
      ])
      setRecentProjectsMenu([])
      expect(openRecent().map((i) => i.label)).toEqual(['No recent projects'])
    })

    it('rebuilds the menu with the Record item relabelled, keeping id and accelerator', () => {
      installAppMenu(actions(), { isPackaged: true })
      setRecordingMenuState(true)
      expect(installedRecord()).toMatchObject({
        id: 'record',
        label: 'Stop & save',
        accelerator: 'CmdOrCtrl+Shift+R'
      })
      setRecordingMenuState(false)
      expect(installedRecord()).toMatchObject({
        id: 'record',
        label: 'Record',
        accelerator: 'CmdOrCtrl+Shift+R'
      })
      expect(mockMenu.setApplicationMenu).toHaveBeenCalledTimes(3)
    })

    it('keeps the actions on the rebuilt menu', () => {
      const a = actions()
      installAppMenu(a, { isPackaged: true })
      setRecordingMenuState(true)
      appState.recording = true
      ;(installedRecord().click as () => void)()
      expect(a.onCommand).toHaveBeenLastCalledWith('stop')
    })

    it('the click follows the reported state at click time', () => {
      const a = actions()
      const record = items(buildAppMenuTemplate('darwin', a, { isPackaged: true }), 'Test').find(
        (i) => i.id === 'record'
      )!
      appState.recording = false
      ;(record.click as () => void)()
      expect(a.onCommand).toHaveBeenLastCalledWith('record')
      appState.recording = true
      ;(record.click as () => void)()
      expect(a.onCommand).toHaveBeenLastCalledWith('stop')
    })
  })

  it('Help has How Ruby Raider works, Documentation, Recording guide and Keyboard shortcuts', () => {
    const help = items(build('darwin'), 'Help')
    expect(help.map((i) => [i.id, i.label])).toEqual([
      ['how-it-works', 'How Ruby Raider works'],
      ['docs', 'Documentation'],
      ['recording-guide', 'Recording guide'],
      ['shortcuts', 'Keyboard shortcuts…']
    ])
  })

  it('the shipped app has no Reload, Force reload or Developer tools in View', () => {
    const roles = items(build('darwin', true), 'View').map((item) => item.role)
    expect(roles).not.toContain('reload')
    expect(roles).not.toContain('forceReload')
    expect(roles).not.toContain('toggleDevTools')
    expect(roles).toEqual(
      expect.arrayContaining(['resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen'])
    )
  })

  it('keeps the developer items in View while developing, with Reload off Cmd+R', () => {
    const view = items(build('darwin', false), 'View')
    expect(view.map((item) => item.role)).toEqual(
      expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools'])
    )
    // Electron keeps the role's default accelerator unless it is set to the empty string
    expect(view.find((item) => item.role === 'reload')).toMatchObject({ accelerator: '' })
  })

  it('marks Help as the macOS help menu', () => {
    expect(menu(build('darwin'), 'Help')).toMatchObject({ role: 'help' })
    expect(menu(build('linux'), 'Help').role).toBeUndefined()
  })

  it.each(['linux', 'win32'] as const)(
    'has no app menu on %s and File ends with Quit',
    (platform) => {
      const template = build(platform)
      expect(template[0]).toMatchObject({ label: 'File' })
      expect(items(template, 'File').at(-1)).toEqual({ role: 'quit' })
    }
  )

  it('reports each command by id and opens a trace when Open trace… is clicked', () => {
    const a = actions()
    const template = buildAppMenuTemplate('darwin', a, { isPackaged: true })
    for (const [label, id] of [
      ['File', 'new-project'],
      ['File', 'open-project'],
      ['File', 'save'],
      ['Test', 'record'],
      ['Test', 'run'],
      ['Help', 'how-it-works']
    ] as const) {
      const item = items(template, label).find((i) => i.id === id)!
      ;(item.click as () => void)()
      expect(a.onCommand).toHaveBeenLastCalledWith(id)
    }
    ;(items(template, 'File').find((i) => i.id === 'open-trace')!.click as () => void)()
    expect(a.onOpenTrace).toHaveBeenCalledTimes(1)
    expect(a.onCommand).toHaveBeenCalledTimes(6)
    ;(items(template, 'Help').find((i) => i.id === 'shortcuts')!.click as () => void)()
    expect(a.onCommand).toHaveBeenLastCalledWith('shortcuts')
  })
})

describe('installAppMenu', () => {
  it('sets the built menu as the application menu', () => {
    installAppMenu(actions(), { isPackaged: true })
    const built = mockMenu.buildFromTemplate.mock.results[0].value
    expect(mockMenu.setApplicationMenu).toHaveBeenCalledWith(built)
    expect(mockMenu.buildFromTemplate.mock.calls[0][0]).toContainEqual(
      expect.objectContaining({ label: 'File' })
    )
  })
})

describe('withLiveWindow', () => {
  const windowWith = (destroyed: boolean): Electron.BrowserWindow =>
    ({ isDestroyed: () => destroyed }) as never

  it('runs the action on the live window, passing the arguments along', () => {
    const action = vi.fn()
    const win = windowWith(false)
    withLiveWindow(() => win, action)('save')
    expect(action).toHaveBeenCalledWith(win, 'save')
  })

  it.each([
    ['no window', null],
    ['a closed window', windowWith(true)]
  ])('does nothing with %s', (_label, win) => {
    const action = vi.fn()
    expect(() => withLiveWindow(() => win, action)()).not.toThrow()
    expect(action).not.toHaveBeenCalled()
  })
})
