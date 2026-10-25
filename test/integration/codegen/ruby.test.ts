import { describe, it, expect } from 'vitest'
import { rubyString } from '../../../src/main/codegen/ruby'

describe('rubyString', () => {
  it('escapes single quotes', () => {
    expect(rubyString("a'b")).toBe("'a\\'b'")
  })
  it('escapes backslashes', () => {
    expect(rubyString('a\\b')).toBe("'a\\\\b'")
  })
  it('keeps interpolation inert', () => {
    expect(rubyString('#{x}')).toBe("'#{x}'")
  })
  it('leaves unicode unchanged', () => {
    expect(rubyString('é🙂')).toBe("'é🙂'")
  })
  it('keeps newlines literal', () => {
    expect(rubyString('a\nb')).toBe("'a\nb'")
  })
})
