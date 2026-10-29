// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { OutputPrefixParser } from '../../../src/main/handlers/run/outputPrefix'

describe('OutputPrefixParser', () => {
  it('splits per worker and maps an empty number to worker 1', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GROUP 2] ..F\n[TEST GROUP ] done\n')).toEqual([
      { worker: 2, text: '..F\n' },
      { worker: 1, text: 'done\n' }
    ])
  })

  it('gives text before any prefix an undefined worker', () => {
    const p = new OutputPrefixParser()
    expect(p.push('hello\n[TEST GROUP 3] x\n')).toEqual([
      { worker: undefined, text: 'hello\n' },
      { worker: 3, text: 'x\n' }
    ])
  })

  it('lets a multi-line read inherit its worker, across pushes too', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GROUP 2] a\nb\n')).toEqual([{ worker: 2, text: 'a\nb\n' }])
    expect(p.push('c\n')).toEqual([{ worker: 2, text: 'c\n' }])
  })

  it('switches worker on a mid-line prefix and strips it', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GROUP 2] .[TEST GROUP ] F')).toEqual([
      { worker: 2, text: '.' },
      { worker: 1, text: 'F' }
    ])
  })

  it('handles a prefix split across two pushes', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GR')).toEqual([])
    expect(p.push('OUP 2] x')).toEqual([{ worker: 2, text: 'x' }])
    expect(p.push('a[TEST GROUP 1')).toEqual([{ worker: 2, text: 'a' }])
    expect(p.push('2] y')).toEqual([{ worker: 12, text: 'y' }])
  })

  it('handles two writes merged in one push', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GROUP 1] a\n[TEST GROUP 2] b\n')).toEqual([
      { worker: 1, text: 'a\n' },
      { worker: 2, text: 'b\n' }
    ])
  })

  it('flush releases a held fragment that was not a prefix', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[TEST GROUP 2] ok [TEST')).toEqual([{ worker: 2, text: 'ok ' }])
    expect(p.flush()).toEqual([{ worker: 2, text: '[TEST' }])
    expect(p.flush()).toEqual([])
  })

  it('does not treat bare [N] as a prefix', () => {
    const p = new OutputPrefixParser()
    expect(p.push('[1] pry(main)> ')).toEqual([{ worker: undefined, text: '[1] pry(main)> ' }])
  })
})
