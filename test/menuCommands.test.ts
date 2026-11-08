import { describe, it, expect, vi } from 'vitest'
import {
  MENU_COMMANDS,
  dispatchMenuCommand,
  isMenuCommand,
  onMenuCommand
} from '@foundation/menuCommands'

describe('menu commands', () => {
  it('knows the commands the menu bar sends and nothing else', () => {
    const sent = [
      'new-project',
      'open-project',
      'save',
      'record',
      'stop',
      'run',
      'new-test',
      'open-file',
      'how-it-works',
      'shortcuts',
      'docs',
      'recording-guide',
      'copy-test',
      'paste-test',
      'duplicate-test',
      'delete-test'
    ]
    for (const c of sent) expect(isMenuCommand(c)).toBe(true)
    expect(MENU_COMMANDS).toEqual(sent)
    expect(isMenuCommand('rm -rf')).toBe(false)
    expect(isMenuCommand(42)).toBe(false)
  })

  it('delivers a command to every listener until it unsubscribes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onMenuCommand(a)
    const offB = onMenuCommand(b)
    dispatchMenuCommand('save')
    offA()
    dispatchMenuCommand('run')
    offB()
    expect(a.mock.calls).toEqual([['save']])
    expect(b.mock.calls).toEqual([['save'], ['run']])
  })
})
