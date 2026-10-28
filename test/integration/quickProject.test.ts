import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { state, mockRun, mockUrl } = vi.hoisted(() => ({
  state: { userData: '' },
  mockRun: vi.fn(),
  mockUrl: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('../../src/main/handlers/project/runRubyRaider', () => ({ default: mockRun }))
vi.mock('../../src/main/handlers/config/updateBrowserUrl', () => ({ default: mockUrl }))

import {
  quickProjectName,
  quickProjectsDir,
  createQuickProject,
  isQuickProject,
  saveQuickProjectTo
} from '../../src/main/handlers/project/quickProject'

let tmp: string

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'quick-')))
  state.userData = path.join(tmp, 'userData')
  mockRun.mockReset().mockImplementation(async (_e, folder: string, name: string) => {
    fs.mkdirSync(path.join(folder, name, 'spec'), { recursive: true })
    fs.writeFileSync(path.join(folder, name, 'spec', 'a.rb'), 'x')
    return { success: true, output: '' }
  })
  mockUrl.mockReset().mockResolvedValue({ success: true, output: '' })
})

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('quickProjectName', () => {
  it('slugs the host without www', () => {
    expect(quickProjectName('https://www.shop.test/cart')).toBe('shop_test')
  })
  it('falls back without a host', () => {
    expect(quickProjectName('not a url')).toBe('quick_record')
  })
})

describe('createQuickProject', () => {
  it('creates selenium + rspec, sets the url, and numbers repeats', async () => {
    const a = await createQuickProject('https://www.shop.test/cart', 'ruby')
    const b = await createQuickProject('https://shop.test', 'ruby')
    expect(a).toEqual({ success: true, projectPath: path.join(quickProjectsDir(), 'shop_test') })
    expect(b.success && b.projectPath.endsWith('shop_test_2')).toBe(true)
    expect(mockRun.mock.calls[0].slice(0, 6)).toEqual([
      null,
      quickProjectsDir(),
      'shop_test',
      'rspec',
      'selenium',
      'ruby'
    ])
    expect(mockUrl).toHaveBeenCalledWith(
      null,
      path.join(quickProjectsDir(), 'shop_test'),
      'https://www.shop.test/cart'
    )
  })

  it('fails without leaving a folder when creation fails', async () => {
    mockRun.mockImplementation(async (_e, folder: string, name: string) => {
      fs.mkdirSync(path.join(folder, name))
      return { success: false, output: '', error: 'no ruby' }
    })
    const r = await createQuickProject('https://shop.test', '')
    expect(r.success).toBe(false)
    expect(fs.existsSync(path.join(quickProjectsDir(), 'shop_test'))).toBe(false)
  })
})

describe('isQuickProject', () => {
  it('is true inside the dir only', async () => {
    const r = await createQuickProject('https://shop.test', 'ruby')
    if (!r.success) throw new Error('setup')
    expect(isQuickProject(r.projectPath)).toBe(true)
    expect(isQuickProject('/tmp/elsewhere')).toBe(false)
    const evil = quickProjectsDir() + '-evil'
    fs.mkdirSync(evil, { recursive: true })
    expect(isQuickProject(evil)).toBe(false)
  })
  it('resolves symlinks', async () => {
    const r = await createQuickProject('https://shop.test', 'ruby')
    if (!r.success) throw new Error('setup')
    const outside = path.join(tmp, 'outside')
    fs.mkdirSync(outside)
    const link = path.join(tmp, 'link')
    fs.symlinkSync(outside, link)
    expect(isQuickProject(link)).toBe(false)
    const inLink = path.join(tmp, 'link2')
    fs.symlinkSync(r.projectPath, inLink)
    expect(isQuickProject(inLink)).toBe(true)
  })
})

describe('saveQuickProjectTo', () => {
  it('moves the project', async () => {
    const r = await createQuickProject('https://shop.test', 'ruby')
    if (!r.success) throw new Error('setup')
    const dest = path.join(tmp, 'dest')
    fs.mkdirSync(dest)
    const s = await saveQuickProjectTo(r.projectPath, dest)
    expect(s).toEqual({ success: true, projectPath: path.join(dest, 'shop_test') })
    expect(fs.existsSync(r.projectPath)).toBe(false)
    expect(fs.readFileSync(path.join(dest, 'shop_test', 'spec', 'a.rb'), 'utf8')).toBe('x')
  })
  it('refuses over an existing path and keeps the source', async () => {
    const r = await createQuickProject('https://shop.test', 'ruby')
    if (!r.success) throw new Error('setup')
    const dest = path.join(tmp, 'dest')
    fs.mkdirSync(path.join(dest, 'shop_test'), { recursive: true })
    const s = await saveQuickProjectTo(r.projectPath, dest)
    expect(s.success).toBe(false)
    expect(fs.existsSync(r.projectPath)).toBe(true)
  })
  it('refuses a project that is not a quick project', async () => {
    const other = path.join(tmp, 'other')
    fs.mkdirSync(other)
    expect((await saveQuickProjectTo(other, tmp)).success).toBe(false)
    expect(fs.existsSync(other)).toBe(true)
  })
})
