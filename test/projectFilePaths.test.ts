import { describe, it, expect } from 'vitest'
import {
  toProjectRel,
  toProjectAbs,
  parentRel,
  isUnder,
  namesAt,
  entryNameProblem,
  samePath
} from '@foundation/projectFilePaths'
import type { FileNode } from '@foundation/Types/fileNode'

const tree: FileNode[] = [
  { name: 'Gemfile', path: '/p/Gemfile', type: 'file', isDirectory: false },
  {
    name: 'spec',
    path: '/p/spec',
    type: 'folder',
    isDirectory: true,
    children: [
      { name: 'a_spec.rb', path: '/p/spec/a_spec.rb', type: 'file', isDirectory: false },
      { name: 'pages', path: '/p/spec/pages', type: 'folder', isDirectory: true, children: [] }
    ]
  }
]

describe('projectFilePaths', () => {
  it('turns tree paths into project-relative POSIX paths and back', () => {
    expect(toProjectRel('/p', '/p/spec/a_spec.rb')).toBe('spec/a_spec.rb')
    expect(toProjectRel('C:\\p', 'C:\\p\\spec\\a.rb')).toBe('spec/a.rb')
    expect(toProjectRel('/p', '/p')).toBe('')
    expect(toProjectRel('/p', '/other/x')).toBeNull()
    expect(toProjectRel('/p', '/p2/x')).toBeNull()
    expect(toProjectAbs('/p', 'spec/a.rb')).toBe('/p/spec/a.rb')
    expect(toProjectAbs('/p', '')).toBe('/p')
  })

  it('compares paths whatever the separator', () => {
    expect(samePath('C:\\p\\a.rb', 'C:/p/a.rb')).toBe(true)
    expect(samePath('/p/a.rb', '/p/b.rb')).toBe(false)
  })

  it('finds the parent folder of an entry', () => {
    expect(parentRel('spec/pages/home.rb')).toBe('spec/pages')
    expect(parentRel('Gemfile')).toBe('')
  })

  it('tells whether a path is the entry or inside it', () => {
    expect(isUnder('/p/spec/a.rb', '/p/spec')).toBe(true)
    expect(isUnder('/p/spec', '/p/spec')).toBe(true)
    expect(isUnder('/p/spec2/a.rb', '/p/spec')).toBe(false)
    expect(isUnder('C:\\p\\spec\\a.rb', 'C:\\p\\spec')).toBe(true)
  })

  it('lists the names in a folder of the tree', () => {
    expect(namesAt(tree, '')).toEqual(['Gemfile', 'spec'])
    expect(namesAt(tree, 'spec')).toEqual(['a_spec.rb', 'pages'])
    expect(namesAt(tree, 'spec/pages')).toEqual([])
    expect(namesAt(tree, 'nope')).toEqual([])
  })

  it('says what is wrong with a new name', () => {
    expect(entryNameProblem('', [])).toBe('files.name.empty')
    expect(entryNameProblem('   ', [])).toBe('files.name.empty')
    for (const bad of ['.', '..', 'a/b', 'a\\b']) {
      expect(entryNameProblem(bad, [])).toBe('files.name.invalid')
    }
    expect(entryNameProblem('Gemfile', ['Gemfile'])).toBe('files.name.taken')
    expect(entryNameProblem('gemfile', ['Gemfile'])).toBe('files.name.taken')
    expect(entryNameProblem('a:b', [])).toBe('files.name.characters')
    expect(entryNameProblem('x.', [])).toBe('files.name.trailing')
    expect(entryNameProblem('CON.rb', [])).toBe('files.name.reserved')
    expect(entryNameProblem('.git', [])).toBe('files.name.protected')
    expect(entryNameProblem('new.rb', ['Gemfile'])).toBeNull()
  })
})
