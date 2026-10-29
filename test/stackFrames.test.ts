import { describe, it, expect } from 'vitest'
import { parseFrame, isProjectFrame, foldFrames } from '@foundation/stackFrames'

const gemA = '/usr/lib/ruby/gems/3.4.0/gems/x/a.rb:1:in a'
const gemB = '/usr/lib/ruby/gems/3.4.0/gems/x/b.rb:2:in b'
const gemC = 'vendor/bundle/c.rb:3'

describe('parseFrame', () => {
  it('parses file and line', () => {
    expect(parseFrame("spec/a_spec.rb:12:in 'x'")).toEqual({ file: 'spec/a_spec.rb', line: 12 })
  })
  it('keeps a Windows drive letter', () => {
    expect(parseFrame("C:/p/spec/a_spec.rb:12:in 'x'")).toEqual({
      file: 'C:/p/spec/a_spec.rb',
      line: 12
    })
  })
  it('returns null for garbage', () => {
    expect(parseFrame('garbage')).toBeNull()
  })
})

describe('parseFrame line terminators', () => {
  it('strips one trailing CR', () => {
    expect(parseFrame("spec/a.rb:12:in 'x'\r")).toEqual({ file: 'spec/a.rb', line: 12 })
  })
  it.each(['\r\r', '\n', '\u2028', '\u2029'])('is unparseable with %j inside', (t) => {
    expect(parseFrame(`spec/a.rb:12:in 'x'${t}`)).toBeNull()
    expect(parseFrame(`spec/a.rb:12:in 'x'${t}y`)).toBeNull()
  })
})

describe('isProjectFrame', () => {
  it('treats (eval) and -e frames as other', () => {
    expect(isProjectFrame('(eval):1')).toBe(false)
    expect(isProjectFrame("-e:1:in 'x'")).toBe(false)
  })
  it('classifies frames', () => {
    expect(isProjectFrame('pages/login.rb:9')).toBe(true)
    expect(isProjectFrame('/usr/lib/ruby/gems/3.4.0/gems/x/y.rb:1')).toBe(false)
    expect(isProjectFrame('vendor/bundle/x.rb:1')).toBe(false)
    expect(isProjectFrame('<internal:kernel>:1')).toBe(false)
  })
  it('treats a Windows frame as other unless it is the app_frame file', () => {
    const f = "C:/proj/spec/a_spec.rb:12:in 'x'"
    expect(isProjectFrame(f)).toBe(false)
    expect(isProjectFrame(f, 'C:/proj/spec/a_spec.rb:12')).toBe(true)
  })
})

describe('foldFrames', () => {
  it('folds runs of other frames around project frames', () => {
    expect(foldFrames([gemA, gemB, 'spec/a_spec.rb:12', gemC], 'spec/a_spec.rb:12:in x')).toEqual([
      { kind: 'folded', lines: [gemA, gemB] },
      { kind: 'project', text: 'spec/a_spec.rb:12' },
      { kind: 'folded', lines: [gemC] }
    ])
  })
  it('folds an all-gem trace into one segment', () => {
    const lines = Array.from({ length: 7 }, (_, i) => `/x/gems/g/f.rb:${i + 1}`)
    expect(foldFrames(lines)).toEqual([{ kind: 'folded', lines }])
  })
  it('returns [] for no lines', () => {
    expect(foldFrames([], undefined)).toEqual([])
  })
})
