// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parsePrefixedOutput } from '../../../src/main/handlers/run/outputPrefix'

describe('parsePrefixedOutput', () => {
  it('splits per worker and maps an empty number to worker 1', () => {
    const parts = parsePrefixedOutput('[2] ..F\n[] done\n')
    expect(parts.map((p) => p.worker)).toEqual([2, 1])
    expect(parts.map((p) => p.text)).toEqual(['..F\n', 'done\n'])
  })

  it('leaves unprefixed text with an undefined worker', () => {
    expect(parsePrefixedOutput('hello\nworld\n')).toEqual([
      { worker: undefined, text: 'hello\nworld\n' }
    ])
  })

  it('coalesces consecutive lines of the same worker', () => {
    expect(parsePrefixedOutput('[3] a\n[3] b\n')).toEqual([{ worker: 3, text: 'a\nb\n' }])
  })

  it('understands the parallel_tests "[TEST GROUP N]" prefix', () => {
    const parts = parsePrefixedOutput('[TEST GROUP 2] x\n[TEST GROUP ] y\n')
    expect(parts).toEqual([
      { worker: 2, text: 'x\n' },
      { worker: 1, text: 'y\n' }
    ])
  })

  it('keeps a trailing partial line without a newline', () => {
    expect(parsePrefixedOutput('[2] abc')).toEqual([{ worker: 2, text: 'abc' }])
  })

  it('returns nothing for an empty chunk', () => {
    expect(parsePrefixedOutput('')).toEqual([])
  })
})
