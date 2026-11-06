import { SHORTCUTS, shortcutLabel, platformFrom } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'

const ids = Object.keys(SHORTCUTS) as ShortcutId[]

describe('shortcuts', () => {
  it('labels every id on mac and elsewhere', () => {
    for (const id of ids) {
      expect(shortcutLabel(id, 'mac')).toBe(SHORTCUTS[id].mac)
      expect(shortcutLabel(id, 'other')).toBe(SHORTCUTS[id].other)
    }
    expect(shortcutLabel('save', 'mac')).toBe('⌘S')
    expect(shortcutLabel('save', 'other')).toBe('Ctrl+S')
  })

  it('record and stop share one key', () => {
    expect(SHORTCUTS.record.accelerator).toBe(SHORTCUTS.stop.accelerator)
  })

  it('no two other actions share an accelerator', () => {
    const set = new Set(ids.filter((id) => id !== 'stop').map((id) => SHORTCUTS[id].accelerator))
    expect(set.size).toBe(ids.length - 1)
  })

  it('platformFrom', () => {
    expect(platformFrom('MacIntel')).toBe('mac')
    expect(platformFrom('Mac')).toBe('mac')
    expect(platformFrom('Win32')).toBe('other')
    expect(platformFrom('Linux x86_64')).toBe('other')
    expect(platformFrom(undefined)).toBe('other')
  })

  it('avoids Monaco and macOS defaults', () => {
    const reserved = [
      'CmdOrCtrl+/',
      'CmdOrCtrl+.',
      'CmdOrCtrl+E',
      'CmdOrCtrl+D',
      'CmdOrCtrl+F',
      'CmdOrCtrl+G',
      'CmdOrCtrl+H',
      'CmdOrCtrl+L',
      'CmdOrCtrl+U',
      'CmdOrCtrl+Shift+K',
      'CmdOrCtrl+Shift+L',
      'CmdOrCtrl+Shift+O',
      'CmdOrCtrl+,',
      'CmdOrCtrl+M',
      'CmdOrCtrl+Q',
      'CmdOrCtrl+W',
      'CmdOrCtrl+P',
      'F1'
    ]
    for (const id of ids) expect(reserved).not.toContain(SHORTCUTS[id].accelerator)
  })
})
