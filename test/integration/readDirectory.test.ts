import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  IpcMainInvokeEvent: {}
}))

vi.mock('fs', () => {
  const readdir = vi.fn()
  return {
    default: {
      promises: {
        readdir
      }
    },
    promises: {
      readdir
    }
  }
})

import fs from 'fs'
import readDirectory from '../../src/main/handlers/io/readDirectory'

const mockReaddir = fs.promises.readdir as ReturnType<typeof vi.fn>
const fakeEvent = {} as any

describe('readDirectory handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns files and folders from a directory', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'src', isDirectory: () => true },
      { name: 'readme.md', isDirectory: () => false }
    ])

    // For the recursive call on the 'src' directory
    mockReaddir.mockResolvedValueOnce([
      { name: 'src', isDirectory: () => true },
      { name: 'readme.md', isDirectory: () => false }
    ]).mockResolvedValueOnce([]) // src subdir is empty

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: 'src',
        isDirectory: true,
        type: 'folder'
      })
    )
    expect(result[1]).toEqual(
      expect.objectContaining({
        name: 'readme.md',
        isDirectory: false,
        type: 'file',
        path: '/tmp/project/readme.md'
      })
    )
  })

  it('excludes .DS_Store files', async () => {
    mockReaddir.mockResolvedValue([
      { name: '.DS_Store', isDirectory: () => false },
      { name: 'test.rb', isDirectory: () => false }
    ])

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('test.rb')
  })

  it('excludes Thumbs.db files', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'Thumbs.db', isDirectory: () => false },
      { name: 'file.txt', isDirectory: () => false }
    ])

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('file.txt')
  })

  it('excludes desktop.ini files', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'desktop.ini', isDirectory: () => false },
      { name: 'app.js', isDirectory: () => false }
    ])

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('app.js')
  })

  it('recursively reads subdirectories', async () => {
    mockReaddir
      .mockResolvedValueOnce([
        { name: 'specs', isDirectory: () => true }
      ])
      .mockResolvedValueOnce([
        { name: 'login_spec.rb', isDirectory: () => false }
      ])

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('specs')
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0].name).toBe('login_spec.rb')
    expect(result[0].children[0].path).toBe('/tmp/project/specs/login_spec.rb')
  })

  it('returns empty array for empty directory', async () => {
    mockReaddir.mockResolvedValue([])
    const result = await readDirectory(fakeEvent, '/tmp/empty')
    expect(result).toEqual([])
  })

  it('handles deeply nested directories', async () => {
    mockReaddir
      .mockResolvedValueOnce([{ name: 'level1', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'level2', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'file.rb', isDirectory: () => false }])

    const result = await readDirectory(fakeEvent, '/tmp/project')
    expect(result[0].name).toBe('level1')
    expect(result[0].children[0].name).toBe('level2')
    expect(result[0].children[0].children[0].name).toBe('file.rb')
  })

  it('sets correct path for files', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'test.rb', isDirectory: () => false }
    ])

    const result = await readDirectory(fakeEvent, '/home/user/project')
    expect(result[0].path).toBe('/home/user/project/test.rb')
  })
})
