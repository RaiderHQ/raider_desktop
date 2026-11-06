import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMenu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  setApplicationMenu: vi.fn()
}))
vi.mock('electron', () => ({ Menu: mockMenu }))

import { buildAppMenuTemplate, installAppMenu, withLiveWindow } from '../../src/main/appMenu'

type Item = Electron.MenuItemConstructorOptions
const menu = (template: Item[], label: string): Item =>
  template.find((item) => item.label === label)!
const items = (template: Item[], label: string): Item[] => menu(template, label).submenu as Item[]
const actions = (): {
  onOpenTrace: ReturnType<typeof vi.fn>
  onCommand: ReturnType<typeof vi.fn>
} => ({
  onOpenTrace: vi.fn(),
  onCommand: vi.fn()
})
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

  it('File has New project, Open project, Open trace and Save, then Close', () => {
    const file = items(build('darwin'), 'File')
    expect(file.map((item) => item.id ?? item.type ?? item.role)).toEqual([
      'new-project',
      'open-project',
      'separator',
      'open-trace',
      'separator',
      'save',
      'separator',
      'close'
    ])
    expect(file[0]).toMatchObject({ label: 'New project…', accelerator: 'CmdOrCtrl+N' })
    expect(file[1]).toMatchObject({ label: 'Open project…', accelerator: 'CmdOrCtrl+O' })
    expect(file[3]).toMatchObject({ label: 'Open trace…' })
    expect(file[5]).toMatchObject({ label: 'Save', accelerator: 'CmdOrCtrl+S' })
  })

  it('Test has Record and Run', () => {
    const test = items(build('darwin'), 'Test')
    expect(test[0]).toMatchObject({
      id: 'record',
      label: 'Record',
      accelerator: 'CmdOrCtrl+Shift+R'
    })
    expect(test[1]).toMatchObject({ id: 'run', label: 'Run', accelerator: 'CmdOrCtrl+R' })
  })

  it('Help opens How Ruby Raider works', () => {
    const help = items(build('darwin'), 'Help')
    expect(help[0]).toMatchObject({ id: 'how-it-works', label: 'How Ruby Raider works' })
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
