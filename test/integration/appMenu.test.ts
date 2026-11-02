import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMenu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  setApplicationMenu: vi.fn()
}))
vi.mock('electron', () => ({ Menu: mockMenu }))

import { buildAppMenuTemplate, installAppMenu } from '../../src/main/appMenu'

type Item = Electron.MenuItemConstructorOptions
const fileMenu = (template: Item[]): Item => template.find((item) => item.label === 'File')!
const fileItems = (template: Item[]): Item[] => fileMenu(template).submenu as Item[]

describe('buildAppMenuTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives macOS the app menu, File, Edit, View and Window', () => {
    const template = buildAppMenuTemplate('darwin', vi.fn())
    expect(template.map((item) => item.role ?? item.label)).toEqual([
      'appMenu',
      'File',
      'editMenu',
      'viewMenu',
      'windowMenu'
    ])
  })

  it('puts Open trace… in File, above Close', () => {
    const items = fileItems(buildAppMenuTemplate('darwin', vi.fn()))
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ id: 'open-trace', label: 'Open trace…' })
    expect(items[1]).toEqual({ type: 'separator' })
    expect(items[2]).toEqual({ role: 'close' })
  })

  it.each(['linux', 'win32'] as const)(
    'has no app menu on %s and File ends with Quit',
    (platform) => {
      const template = buildAppMenuTemplate(platform, vi.fn())
      expect(template.map((item) => item.role ?? item.label)).toEqual([
        'File',
        'editMenu',
        'viewMenu',
        'windowMenu'
      ])
      const items = fileItems(template)
      expect(items[0]).toMatchObject({ id: 'open-trace', label: 'Open trace…' })
      expect(items.at(-1)).toEqual({ role: 'quit' })
    }
  )

  it('opens a trace when Open trace… is clicked', () => {
    const onOpenTrace = vi.fn()
    const openTrace = fileItems(buildAppMenuTemplate('darwin', onOpenTrace))[0]
    ;(openTrace.click as () => void)()
    expect(onOpenTrace).toHaveBeenCalledTimes(1)
  })
})

describe('installAppMenu', () => {
  it('sets the built menu as the application menu', () => {
    installAppMenu(vi.fn())
    const built = mockMenu.buildFromTemplate.mock.results[0].value
    expect(mockMenu.setApplicationMenu).toHaveBeenCalledWith(built)
    expect(mockMenu.buildFromTemplate.mock.calls[0][0]).toContainEqual(
      expect.objectContaining({ label: 'File' })
    )
  })
})
