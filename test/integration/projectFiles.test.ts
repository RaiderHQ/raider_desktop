import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const trashItem = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem }
}))

import { appState } from '../../src/main/handlers/appState'
import {
  createProjectEntry,
  copyProjectEntry,
  duplicateProjectEntry,
  renameProjectEntry,
  trashProjectEntry
} from '../../src/main/handlers/io/projectFiles'

let project: string
let outside: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-files-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-files-out-'))
  await mkdir(join(project, 'spec', 'pages'), { recursive: true })
  await writeFile(join(project, 'spec', 'login_spec.rb'), 'login')
  await writeFile(join(project, 'spec', 'pages', 'home.rb'), 'home')
  await writeFile(join(project, 'Gemfile'), 'gems')
  await writeFile(join(outside, 'secret.txt'), 'secret')
  appState.projectPath = project
  trashItem.mockClear()
})

afterEach(async () => {
  appState.projectPath = null
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

const read = (rel: string): Promise<string> => readFile(join(project, rel), 'utf-8')

describe('createProjectEntry', () => {
  it('creates an empty file in a folder and returns its project-relative path', async () => {
    const res = await createProjectEntry('spec', 'new_spec.rb', 'file')
    expect(res).toEqual({ success: true, path: 'spec/new_spec.rb' })
    expect(await read('spec/new_spec.rb')).toBe('')
  })

  it('creates a folder at the project root when the parent is empty', async () => {
    const res = await createProjectEntry('', 'support', 'folder')
    expect(res).toEqual({ success: true, path: 'support' })
    expect((await lstat(join(project, 'support'))).isDirectory()).toBe(true)
  })

  it('never overwrites an existing file or folder', async () => {
    const file = await createProjectEntry('spec', 'login_spec.rb', 'file')
    expect(file).toMatchObject({ success: false, code: 'exists' })
    expect(await read('spec/login_spec.rb')).toBe('login')
    const folder = await createProjectEntry('spec', 'pages', 'folder')
    expect(folder).toMatchObject({ success: false, code: 'exists' })
    expect(await read('spec/pages/home.rb')).toBe('home')
  })

  it.each(['', '   ', '.', '..', 'a/b', 'a\\b', '../x', '/abs', 'nul\0l'])(
    'refuses the name %j',
    async (name) => {
      const res = await createProjectEntry('spec', name, 'file')
      expect(res).toMatchObject({ success: false, code: 'invalidName' })
    }
  )

  it('refuses ../ traversal and absolute paths as the parent', async () => {
    for (const parent of ['..', '../x', 'spec/../..', outside, '/tmp', 'C:\\x']) {
      const res = await createProjectEntry(parent, 'evil.rb', 'file')
      expect(res.success).toBe(false)
    }
    expect(existsSync(join(outside, 'evil.rb'))).toBe(false)
  })

  it('refuses a parent folder that is a symlink pointing outside the project', async () => {
    await symlink(outside, join(project, 'out'))
    const res = await createProjectEntry('out', 'evil.rb', 'file')
    expect(res.success).toBe(false)
    expect(existsSync(join(outside, 'evil.rb'))).toBe(false)
  })

  it('does not write through an existing symlink with the same name', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'link.txt'))
    const res = await createProjectEntry('', 'link.txt', 'file')
    expect(res).toMatchObject({ success: false, code: 'exists' })
    expect(await readFile(join(outside, 'secret.txt'), 'utf-8')).toBe('secret')
  })

  it('fails without an open project', async () => {
    appState.projectPath = null
    expect((await createProjectEntry('', 'a.rb', 'file')).success).toBe(false)
  })

  it('refuses an unknown kind', async () => {
    const res = await createProjectEntry('', 'a', 'socket' as never)
    expect(res.success).toBe(false)
    expect(existsSync(join(project, 'a'))).toBe(false)
  })
})

describe('duplicateProjectEntry', () => {
  it('names the copy like before: base_copy.ext, then base_copy2.ext', async () => {
    expect(await duplicateProjectEntry('spec/login_spec.rb')).toMatchObject({
      success: true,
      path: 'spec/login_spec_copy.rb'
    })
    expect(await duplicateProjectEntry('spec/login_spec.rb')).toMatchObject({
      success: true,
      path: 'spec/login_spec_copy2.rb'
    })
    expect(await read('spec/login_spec_copy2.rb')).toBe('login')
  })

  it('duplicates a folder recursively without splitting a dot in its name', async () => {
    await mkdir(join(project, 'v1.2'))
    await writeFile(join(project, 'v1.2', 'a.rb'), 'a')
    expect(await duplicateProjectEntry('v1.2')).toMatchObject({ success: true, path: 'v1.2_copy' })
    expect(await read('v1.2_copy/a.rb')).toBe('a')
    expect(await duplicateProjectEntry('spec')).toMatchObject({ success: true, path: 'spec_copy' })
    expect(await read('spec_copy/pages/home.rb')).toBe('home')
  })

  it('refuses the project root, traversal and absolute paths', async () => {
    for (const rel of ['', '.', '..', '../x', join(outside, 'secret.txt')]) {
      expect((await duplicateProjectEntry(rel)).success).toBe(false)
    }
  })

  it('refuses a symlink source pointing outside the project', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    const res = await duplicateProjectEntry('secret.txt')
    expect(res.success).toBe(false)
    expect(existsSync(join(project, 'secret_copy.txt'))).toBe(false)
  })
})

describe('copyProjectEntry', () => {
  it('pastes a file into another folder under its own name', async () => {
    expect(await copyProjectEntry('Gemfile', 'spec')).toEqual({
      success: true,
      path: 'spec/Gemfile',
      skipped: 0
    })
    expect(await read('spec/Gemfile')).toBe('gems')
  })

  it('uses the duplicate naming rule when the name is taken', async () => {
    expect(await copyProjectEntry('spec/login_spec.rb', 'spec')).toMatchObject({
      success: true,
      path: 'spec/login_spec_copy.rb'
    })
    await writeFile(join(project, 'login_spec.rb'), 'mine')
    expect(await copyProjectEntry('spec/login_spec.rb', '')).toMatchObject({
      success: true,
      path: 'login_spec_copy.rb'
    })
    expect(await read('login_spec.rb')).toBe('mine')
  })

  it('pastes a folder recursively into the project root', async () => {
    await mkdir(join(project, 'other'))
    expect(await copyProjectEntry('spec/pages', 'other')).toMatchObject({
      success: true,
      path: 'other/pages'
    })
    expect(await read('other/pages/home.rb')).toBe('home')
  })

  it('refuses to paste a folder into itself or its own descendant', async () => {
    expect(await copyProjectEntry('spec', 'spec')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
    expect(await copyProjectEntry('spec', 'spec/pages')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
    expect(existsSync(join(project, 'spec', 'spec_copy'))).toBe(false)
    expect(existsSync(join(project, 'spec', 'pages', 'spec'))).toBe(false)
  })

  it('refuses a descendant reached through a symlink inside the project', async () => {
    await symlink(join(project, 'spec', 'pages'), join(project, 'pages_link'))
    expect(await copyProjectEntry('spec', 'pages_link')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
  })

  it('a folder named like a prefix of the source is not a descendant', async () => {
    await mkdir(join(project, 'spec2'))
    expect((await copyProjectEntry('spec', 'spec2')).success).toBe(true)
  })

  it('refuses ../ traversal and absolute paths for source and destination', async () => {
    const cases: [string, string][] = [
      ['../x', ''],
      [join(outside, 'secret.txt'), ''],
      ['Gemfile', '..'],
      ['Gemfile', outside],
      ['Gemfile', '../' + outside.split('/').pop()]
    ]
    for (const [src, dest] of cases) {
      expect((await copyProjectEntry(src, dest)).success).toBe(false)
    }
    expect(existsSync(join(outside, 'Gemfile'))).toBe(false)
  })

  it('refuses the project root as the source', async () => {
    expect((await copyProjectEntry('', 'spec')).success).toBe(false)
  })

  it('refuses a source that is a symlink pointing outside', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    await symlink(outside, join(project, 'outdir'))
    expect((await copyProjectEntry('secret.txt', 'spec')).success).toBe(false)
    expect((await copyProjectEntry('outdir', 'spec')).success).toBe(false)
    expect(existsSync(join(project, 'spec', 'secret.txt'))).toBe(false)
    expect(existsSync(join(project, 'spec', 'outdir'))).toBe(false)
  })

  it('refuses a destination folder that is a symlink pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await copyProjectEntry('Gemfile', 'outdir')).success).toBe(false)
    expect(existsSync(join(outside, 'Gemfile'))).toBe(false)
  })

  it('refuses a destination that is a file', async () => {
    expect((await copyProjectEntry('spec/login_spec.rb', 'Gemfile')).success).toBe(false)
  })

  it('skips symlinks inside a copied folder, wherever they point', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'spec', 'out.txt'))
    await symlink(outside, join(project, 'spec', 'outdir'))
    await symlink(join(project, 'Gemfile'), join(project, 'spec', 'in.txt'))
    const res = await copyProjectEntry('spec', '')
    expect(res).toEqual({ success: true, path: 'spec_copy', skipped: 3 })
    expect((await readdir(join(project, 'spec_copy'))).sort()).toEqual(['login_spec.rb', 'pages'])
    expect(await read('spec_copy/pages/home.rb')).toBe('home')
  })

  it('fails when the source does not exist', async () => {
    expect((await copyProjectEntry('nope.rb', '')).success).toBe(false)
  })
})

describe('renameProjectEntry', () => {
  it('renames a file in its folder', async () => {
    expect(await renameProjectEntry('spec/login_spec.rb', 'auth_spec.rb')).toEqual({
      success: true,
      path: 'spec/auth_spec.rb'
    })
    expect(await read('spec/auth_spec.rb')).toBe('login')
  })

  it('renames a folder', async () => {
    expect(await renameProjectEntry('spec/pages', 'screens')).toMatchObject({
      success: true,
      path: 'spec/screens'
    })
  })

  it('never overwrites an existing entry', async () => {
    await writeFile(join(project, 'spec', 'other.rb'), 'other')
    expect(await renameProjectEntry('spec/login_spec.rb', 'other.rb')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await read('spec/other.rb')).toBe('other')
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it.each(['', '..', '.', 'a/b', '..\\b', '../../evil'])('refuses the name %j', async (name) => {
    expect(await renameProjectEntry('Gemfile', name)).toMatchObject({
      success: false,
      code: 'invalidName'
    })
    expect(await read('Gemfile')).toBe('gems')
  })

  it('refuses the root, traversal and absolute paths', async () => {
    for (const rel of ['', '..', '../x', join(project, 'Gemfile')]) {
      expect((await renameProjectEntry(rel, 'x')).success).toBe(false)
    }
    expect(await read('Gemfile')).toBe('gems')
  })

  it('renames a symlink pointing outside as a link, never touching its target', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    expect((await renameProjectEntry('secret.txt', 'renamed.txt')).success).toBe(true)
    expect((await lstat(join(project, 'renamed.txt'))).isSymbolicLink()).toBe(true)
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true)
    expect(existsSync(join(outside, 'renamed.txt'))).toBe(false)
  })

  it('refuses an entry reached through a symlinked folder pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await renameProjectEntry('outdir/secret.txt', 'x.txt')).success).toBe(false)
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true)
  })
})

describe('trashProjectEntry', () => {
  it('moves a file to the OS Trash and never deletes it with fs', async () => {
    const rmSpy = vi.spyOn(fsp, 'rm')
    const unlinkSpy = vi.spyOn(fsp, 'unlink')
    const rmdirSpy = vi.spyOn(fsp, 'rmdir')
    expect(await trashProjectEntry('spec/login_spec.rb')).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(join(project, 'spec', 'login_spec.rb'))
    expect(rmSpy).not.toHaveBeenCalled()
    expect(unlinkSpy).not.toHaveBeenCalled()
    expect(rmdirSpy).not.toHaveBeenCalled()
    // The mocked Trash does nothing, so the file must still be there
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it('trashes a folder the same way', async () => {
    expect(await trashProjectEntry('spec')).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(join(project, 'spec'))
    expect(existsSync(join(project, 'spec', 'pages', 'home.rb'))).toBe(true)
  })

  it('never trashes the project root, traversal or absolute paths', async () => {
    for (const rel of ['', '.', '..', '../x', 'spec/../..', project, join(outside, 'secret.txt')]) {
      expect((await trashProjectEntry(rel)).success).toBe(false)
    }
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('trashes a symlink pointing outside as the link itself', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    expect((await trashProjectEntry('secret.txt')).success).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(join(project, 'secret.txt'))
  })

  it('refuses an entry reached through a symlinked folder pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await trashProjectEntry('outdir/secret.txt')).success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('reports a missing entry', async () => {
    expect((await trashProjectEntry('nope.rb')).success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('reports a Trash failure', async () => {
    trashItem.mockRejectedValueOnce(new Error('no trash here'))
    expect(await trashProjectEntry('Gemfile')).toMatchObject({ success: false })
  })
})
