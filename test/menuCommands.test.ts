import { describe, it, expect, vi } from 'vitest'
import { dispatchMenuCommand, isMenuCommand, onMenuCommand } from '@foundation/menuCommands'

describe('menu commands', () => {
  it('knows the commands the menu bar sends and nothing else', () => {
    for (const c of ['new-project', 'open-project', 'save', 'record', 'run', 'how-it-works']) {
      expect(isMenuCommand(c)).toBe(true)
    }
    expect(isMenuCommand('rm -rf')).toBe(false)
    expect(isMenuCommand(42)).toBe(false)
  })

  it('delivers a command to every listener until it unsubscribes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onMenuCommand(a)
    onMenuCommand(b)
    dispatchMenuCommand('save')
    offA()
    dispatchMenuCommand('run')
    expect(a.mock.calls).toEqual([['save']])
    expect(b.mock.calls).toEqual([['save'], ['run']])
  })
})
