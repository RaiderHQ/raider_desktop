import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const userData = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: (): string => userData.dir } }))
vi.mock('../../src/main/handlers/project/quickProject', () => ({
  quickProjectsDir: (): string => path.join(userData.dir, 'quick-record')
}))

import {
  clearRecentProjects,
  listRecentProjects,
  readRecentProjects,
  recordRecentProject,
  removeRecentProject,
  RECENT_PROJECTS_LIMIT
} from '../../src/main/handlers/project/recentProjects'

const file = (): string => path.join(userData.dir, 'recent-projects.json')
const folder = (name: string, raider = true): string => {
  const dir = path.join(userData.dir, 'projects', name)
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  if (raider) fs.writeFileSync(path.join(dir, 'config', 'config.yml'), 'browser: chrome\n')
  return dir
}

describe('recentProjects', () => {
  beforeEach(() => {
    userData.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-recent-'))
  })
  afterEach(() => {
    fs.rmSync(userData.dir, { recursive: true, force: true })
  })

  it('is empty before any project was opened', () => {
    expect(readRecentProjects()).toEqual([])
    expect(listRecentProjects()).toEqual([])
  })

  it('records an opened folder newest first, once per path, with its name', () => {
    const shop = folder('shop')
    const blog = folder('blog')
    recordRecentProject(shop)
    recordRecentProject(blog)
    recordRecentProject(shop)
    const paths = readRecentProjects().map((p) => p.path)
    expect(paths).toEqual([shop, blog])
    expect(readRecentProjects()[0]).toMatchObject({ name: 'shop' })
    expect(typeof readRecentProjects()[0].lastOpened).toBe('number')
  })

  it('keeps only the newest entries up to the limit', () => {
    for (let i = 0; i < RECENT_PROJECTS_LIMIT + 3; i++) recordRecentProject(folder(`p${i}`))
    const names = readRecentProjects().map((p) => p.name)
    expect(names).toHaveLength(RECENT_PROJECTS_LIMIT)
    expect(names[0]).toBe(`p${RECENT_PROJECTS_LIMIT + 2}`)
  })

  it('leaves out quick recordings and folders that do not exist', () => {
    const quick = path.join(userData.dir, 'quick-record', 'example_com')
    fs.mkdirSync(quick, { recursive: true })
    recordRecentProject(quick)
    recordRecentProject(path.join(userData.dir, 'projects', 'missing'))
    recordRecentProject(path.join(userData.dir, 'quick-record-not-quite', 'x'))
    expect(readRecentProjects()).toEqual([])
  })

  it('lists whether each folder still exists and looks like a Raider project', () => {
    const shop = folder('shop')
    const plain = folder('plain', false)
    const gone = folder('gone')
    recordRecentProject(gone)
    recordRecentProject(plain)
    recordRecentProject(shop)
    fs.rmSync(gone, { recursive: true })
    expect(listRecentProjects().map((p) => [p.name, p.exists, p.isRaider])).toEqual([
      ['shop', true, true],
      ['plain', true, false],
      ['gone', false, false]
    ])
  })

  it('removes one entry by its exact path, and clears them all', () => {
    const shop = folder('shop')
    const blog = folder('blog')
    recordRecentProject(shop)
    recordRecentProject(blog)
    removeRecentProject(shop + '/')
    expect(readRecentProjects()).toHaveLength(2)
    removeRecentProject(shop)
    expect(readRecentProjects().map((p) => p.path)).toEqual([blog])
    clearRecentProjects()
    expect(readRecentProjects()).toEqual([])
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ version: 1, projects: [] })
  })

  it('drops anything in the file that is not the expected shape', () => {
    const shop = folder('shop')
    fs.writeFileSync(
      file(),
      JSON.stringify({
        version: 1,
        extra: true,
        projects: [
          { path: shop, name: 'shop', lastOpened: 5, stray: 'x' },
          { path: 42, name: 'bad', lastOpened: 1 },
          { name: 'no path', lastOpened: 1 },
          'nonsense',
          ...Array.from({ length: 20 }, (_, i) => ({
            path: `/p${i}`,
            name: `p${i}`,
            lastOpened: i
          }))
        ]
      })
    )
    const read = readRecentProjects()
    expect(read).toHaveLength(RECENT_PROJECTS_LIMIT)
    expect(read[0]).toEqual({ path: shop, name: 'shop', lastOpened: 5 })
    fs.writeFileSync(file(), '{ not json')
    expect(readRecentProjects()).toEqual([])
  })

  it('writes the file whole: no temp file is left behind', () => {
    recordRecentProject(folder('shop'))
    expect(fs.readdirSync(userData.dir).filter((f) => f.startsWith('recent-projects'))).toEqual([
      'recent-projects.json'
    ])
  })
})
