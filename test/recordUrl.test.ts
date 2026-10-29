import { describe, it, expect } from 'vitest'
import { toRecordableUrl, withScheme } from '../src/shared/recordUrl'

describe('withScheme', () => {
  it.each([
    ['example.com', 'https://example.com'],
    [' localhost:3000/a ', 'https://localhost:3000/a'],
    ['http://x.test', 'http://x.test'],
    ['file:///tmp/a.html', 'file:///tmp/a.html']
  ])('%j becomes %j', (raw, expected) => expect(withScheme(raw)).toBe(expected))
})

describe('toRecordableUrl', () => {
  it.each([
    ['example.com/login', 'https://example.com/login'],
    ['http://localhost:3000/', 'http://localhost:3000/'],
    ['HTTPS://Example.com', 'https://example.com/']
  ])('accepts %j as %j', (raw, expected) => expect(toRecordableUrl(raw)).toBe(expected))

  it.each(['file:///tmp/a.html', 'ftp://x.test/', 'javascript:alert(1)', 'data:text/html,x', ''])(
    'refuses %j',
    (raw) => expect(toRecordableUrl(raw)).toBeNull()
  )
})
