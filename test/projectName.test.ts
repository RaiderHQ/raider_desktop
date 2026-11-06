import { describe, it, expect } from 'vitest'
import { isValidProjectName } from '@shared/projectName'

describe('isValidProjectName', () => {
  it.each(['my_project', 'MyProject', 'shop-tests', 'a', '2fa_checks'])('accepts %s', (name) => {
    expect(isValidProjectName(name)).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['ux test project', 'spaces'],
    ['-flag', 'a leading hyphen, which raider would read as an option'],
    ['_hidden', 'a leading underscore'],
    ['../escape', 'a parent path'],
    ['a/b', 'a path separator'],
    ['a\\b', 'a backslash'],
    ['$(whoami)', 'shell substitution'],
    ['café', 'accented letters'],
    ['name.', 'a dot']
  ])('rejects %j (%s)', (name) => {
    expect(isValidProjectName(name)).toBe(false)
  })
})
