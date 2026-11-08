import { describe, it, expect } from 'vitest'
import { entryNameIssue } from '../src/shared/entryName'

describe('entryNameIssue', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    [42, 'empty'],
    ['.', 'invalid'],
    ['..', 'invalid'],
    [' .. ', 'invalid'],
    ['a/b', 'invalid'],
    ['a\\b', 'invalid'],
    ['a:b', 'characters'],
    ['a<b', 'characters'],
    ['a>b', 'characters'],
    ['a"b', 'characters'],
    ['a|b', 'characters'],
    ['a?b', 'characters'],
    ['a*b', 'characters'],
    ['a\0b', 'characters'],
    ['a\nb', 'characters'],
    ['a\x1fb', 'characters'],
    ['name.', 'trailing'],
    ['name ', 'trailing'],
    ['CON', 'reserved'],
    ['con.rb', 'reserved'],
    ['Nul', 'reserved'],
    ['com1.txt', 'reserved'],
    ['LPT9', 'reserved'],
    ['.git', 'protected'],
    ['.GIT', 'protected'],
    ['.Raider', 'protected']
  ])('%j is refused as %s', (name, issue) => {
    expect(entryNameIssue(name)).toBe(issue)
  })

  it.each(['login_spec.rb', '.rspec', 'v1.2', 'console.rb', 'com10', 'lpt', '.github', 'a b'])(
    '%j is fine',
    (name) => {
      expect(entryNameIssue(name)).toBeNull()
    }
  )
})
