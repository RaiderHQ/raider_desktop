import { describe, it, expect } from 'vitest'
import { quoteShellArg } from '../../src/main/utils/shellQuote'

describe('quoteShellArg', () => {
  it('leaves safe tokens bare on both platforms', () => {
    expect(quoteShellArg('pages/login-1.rb', 'linux')).toBe('pages/login-1.rb')
    expect(quoteShellArg('pages/login-1.rb', 'win32')).toBe('pages/login-1.rb')
  })

  it.each([';', '$(x)', '`x`', 'a b'])('single-quotes %s on posix', (v) => {
    expect(quoteShellArg(v, 'linux')).toBe(`'${v}'`)
  })

  it('escapes single quotes on posix', () => {
    expect(quoteShellArg("it's", 'darwin')).toBe("'it'\\''s'")
  })

  it.each([';', '$(x)', '`x`', 'a b', "it's"])('double-quotes %s on win32', (v) => {
    expect(quoteShellArg(v, 'win32')).toBe(`"${v}"`)
  })

  it('doubles embedded double quotes on win32', () => {
    expect(quoteShellArg('say "hi"', 'win32')).toBe('"say ""hi"""')
  })
})
