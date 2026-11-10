import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const trashItem = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem }
}))

import { appState } from '../../src/main/handlers/appState'
import { RECORDED_MARKER } from '../../src/main/codegen/testFile'
import {
  createProjectEntry,
  copyProjectEntry,
  duplicateProjectEntry,
  renameProjectEntry,
  trashProjectEntry
} from '../../src/main/handlers/io/projectFiles'

let project: string
let outside: string
// Nothing here may ever delete with fs: Delete is the OS Trash, and nothing is overwritten
let deletions: ReturnType<typeof vi.spyOn>[] = []

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
  deletions = [vi.spyOn(fsp, 'rm'), vi.spyOn(fsp, 'unlink'), vi.spyOn(fsp, 'rmdir')]
})

afterEach(async () => {
  for (const spy of deletions) expect(spy).not.toHaveBeenCalled()
  appState.projectPath = null
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

const read = (rel: string): Promise<string> => readFile(join(project, rel), 'utf-8')

describe('createProjectEntry', () => {
  it('creates an empty file in a folder and returns its project-relative path', async () => {
    const res = await createProjectEntry(project, 'spec', 'new_spec.rb', 'file')
    expect(res).toEqual({ success: true, path: 'spec/new_spec.rb' })
    expect(await read('spec/new_spec.rb')).toBe('')
  })

  it('creates a folder at the project root when the parent is empty', async () => {
    const res = await createProjectEntry(project, '', 'support', 'folder')
    expect(res).toEqual({ success: true, path: 'support' })
    expect((await lstat(join(project, 'support'))).isDirectory()).toBe(true)
  })

  it('never overwrites an existing file or folder', async () => {
    const file = await createProjectEntry(project, 'spec', 'login_spec.rb', 'file')
    expect(file).toMatchObject({ success: false, code: 'exists' })
    expect(await read('spec/login_spec.rb')).toBe('login')
    const folder = await createProjectEntry(project, 'spec', 'pages', 'folder')
    expect(folder).toMatchObject({ success: false, code: 'exists' })
    expect(await read('spec/pages/home.rb')).toBe('home')
  })

  it.each(['', '   ', '.', '..', 'a/b', 'a\\b', '../x', '/abs', 'nul\0l'])(
    'refuses the name %j',
    async (name) => {
      const res = await createProjectEntry(project, 'spec', name, 'file')
      expect(res).toMatchObject({ success: false, code: 'invalidName' })
    }
  )

  it('refuses ../ traversal and absolute paths as the parent', async () => {
    for (const parent of ['..', '../x', 'spec/../..', outside, '/tmp', 'C:\\x']) {
      const res = await createProjectEntry(project, parent, 'evil.rb', 'file')
      expect(res.success).toBe(false)
    }
    expect(existsSync(join(outside, 'evil.rb'))).toBe(false)
  })

  it('refuses a parent folder that is a symlink pointing outside the project', async () => {
    await symlink(outside, join(project, 'out'))
    const res = await createProjectEntry(project, 'out', 'evil.rb', 'file')
    expect(res.success).toBe(false)
    expect(existsSync(join(outside, 'evil.rb'))).toBe(false)
  })

  it('does not write through an existing symlink with the same name', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'link.txt'))
    const res = await createProjectEntry(project, '', 'link.txt', 'file')
    expect(res).toMatchObject({ success: false, code: 'exists' })
    expect(await readFile(join(outside, 'secret.txt'), 'utf-8')).toBe('secret')
  })

  it('fails without an open project', async () => {
    appState.projectPath = null
    expect((await createProjectEntry(project, '', 'a.rb', 'file')).success).toBe(false)
  })

  it('refuses an unknown kind', async () => {
    const res = await createProjectEntry(project, '', 'a', 'socket' as never)
    expect(res.success).toBe(false)
    expect(existsSync(join(project, 'a'))).toBe(false)
  })
})

describe('duplicateProjectEntry', () => {
  it('names the copy like before: base_copy.ext, then base_copy2.ext', async () => {
    expect(await duplicateProjectEntry(project, 'Gemfile')).toMatchObject({
      success: true,
      path: 'Gemfile_copy'
    })
    await writeFile(join(project, 'helper.rb'), 'h')
    await duplicateProjectEntry(project, 'helper.rb')
    expect(await duplicateProjectEntry(project, 'helper.rb')).toMatchObject({
      success: true,
      path: 'helper_copy2.rb'
    })
    expect(await read('helper_copy2.rb')).toBe('h')
  })

  it('keeps a spec a spec: base_copy_spec.rb, then base_copy_2_spec.rb', async () => {
    expect(await duplicateProjectEntry(project, 'spec/login_spec.rb')).toMatchObject({
      success: true,
      path: 'spec/login_copy_spec.rb'
    })
    expect(await duplicateProjectEntry(project, 'spec/login_spec.rb')).toMatchObject({
      success: true,
      path: 'spec/login_copy_2_spec.rb'
    })
    expect(await read('spec/login_copy_2_spec.rb')).toBe('login')
  })

  it('drops the recorded marker from a copied spec, so the copy is a plain code test', async () => {
    const recorded = [
      '# frozen_string_literal: true',
      '',
      `${RECORDED_MARKER} Edit in Raider; editing here makes the test code-owned.`,
      "describe 'Login' do",
      'end',
      ''
    ].join('\n')
    await writeFile(join(project, 'spec', 'login_spec.rb'), recorded)
    await duplicateProjectEntry(project, 'spec/login_spec.rb')
    const copy = await read('spec/login_copy_spec.rb')
    expect(copy).not.toContain(RECORDED_MARKER)
    expect(copy).toBe("# frozen_string_literal: true\n\ndescribe 'Login' do\nend\n")
    // Only the header's first marker goes: a marker further down is the test's own text
    const later = `${RECORDED_MARKER} header\nputs 1\n${RECORDED_MARKER} body\n`
    await writeFile(join(project, 'spec', 'later_spec.rb'), later)
    await duplicateProjectEntry(project, 'spec/later_spec.rb')
    expect(await read('spec/later_copy_spec.rb')).toBe(`puts 1\n${RECORDED_MARKER} body\n`)
    // Inside a copied folder too; a non-spec file keeps its text as it is
    await writeFile(join(project, 'spec', 'pages', 'notes.rb'), `${RECORDED_MARKER}\n`)
    await copyProjectEntry(project, 'spec', '')
    expect(await read('spec_copy/login_spec.rb')).not.toContain(RECORDED_MARKER)
    expect(await read('spec_copy/later_spec.rb')).toBe(`puts 1\n${RECORDED_MARKER} body\n`)
    expect(await read('spec_copy/pages/notes.rb')).toBe(`${RECORDED_MARKER}\n`)
    // The original is untouched
    expect(await read('spec/login_spec.rb')).toBe(recorded)
  })

  it('duplicates a folder recursively without splitting a dot in its name', async () => {
    await mkdir(join(project, 'v1.2'))
    await writeFile(join(project, 'v1.2', 'a.rb'), 'a')
    expect(await duplicateProjectEntry(project, 'v1.2')).toMatchObject({
      success: true,
      path: 'v1.2_copy'
    })
    expect(await read('v1.2_copy/a.rb')).toBe('a')
    expect(await duplicateProjectEntry(project, 'spec')).toMatchObject({
      success: true,
      path: 'spec_copy'
    })
    expect(await read('spec_copy/pages/home.rb')).toBe('home')
  })

  it('refuses the project root, traversal and absolute paths', async () => {
    for (const rel of ['', '.', '..', '../x', join(outside, 'secret.txt')]) {
      expect((await duplicateProjectEntry(project, rel)).success).toBe(false)
    }
  })

  it('refuses a symlink source pointing outside the project', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    const res = await duplicateProjectEntry(project, 'secret.txt')
    expect(res.success).toBe(false)
    expect(existsSync(join(project, 'secret_copy.txt'))).toBe(false)
  })
})

describe('copyProjectEntry', () => {
  it('pastes a file into another folder under its own name', async () => {
    expect(await copyProjectEntry(project, 'Gemfile', 'spec')).toEqual({
      success: true,
      path: 'spec/Gemfile',
      skipped: 0
    })
    expect(await read('spec/Gemfile')).toBe('gems')
  })

  it('uses the duplicate naming rule when the name is taken', async () => {
    expect(await copyProjectEntry(project, 'spec/login_spec.rb', 'spec')).toMatchObject({
      success: true,
      path: 'spec/login_copy_spec.rb'
    })
    await writeFile(join(project, 'login_spec.rb'), 'mine')
    expect(await copyProjectEntry(project, 'spec/login_spec.rb', '')).toMatchObject({
      success: true,
      path: 'login_copy_spec.rb'
    })
    expect(await read('login_spec.rb')).toBe('mine')
  })

  it('pastes a folder recursively into the project root', async () => {
    await mkdir(join(project, 'other'))
    expect(await copyProjectEntry(project, 'spec/pages', 'other')).toMatchObject({
      success: true,
      path: 'other/pages'
    })
    expect(await read('other/pages/home.rb')).toBe('home')
  })

  it('refuses to paste a folder into itself or its own descendant', async () => {
    expect(await copyProjectEntry(project, 'spec', 'spec')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
    expect(await copyProjectEntry(project, 'spec', 'spec/pages')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
    expect(existsSync(join(project, 'spec', 'spec_copy'))).toBe(false)
    expect(existsSync(join(project, 'spec', 'pages', 'spec'))).toBe(false)
  })

  it('refuses a descendant reached through a symlink inside the project', async () => {
    await symlink(join(project, 'spec', 'pages'), join(project, 'pages_link'))
    expect(await copyProjectEntry(project, 'spec', 'pages_link')).toMatchObject({
      success: false,
      code: 'intoItself'
    })
  })

  it('a folder named like a prefix of the source is not a descendant', async () => {
    await mkdir(join(project, 'spec2'))
    expect((await copyProjectEntry(project, 'spec', 'spec2')).success).toBe(true)
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
      expect((await copyProjectEntry(project, src, dest)).success).toBe(false)
    }
    expect(existsSync(join(outside, 'Gemfile'))).toBe(false)
  })

  it('refuses the project root as the source', async () => {
    expect((await copyProjectEntry(project, '', 'spec')).success).toBe(false)
  })

  it('refuses a source that is a symlink pointing outside', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    await symlink(outside, join(project, 'outdir'))
    expect((await copyProjectEntry(project, 'secret.txt', 'spec')).success).toBe(false)
    expect((await copyProjectEntry(project, 'outdir', 'spec')).success).toBe(false)
    expect(existsSync(join(project, 'spec', 'secret.txt'))).toBe(false)
    expect(existsSync(join(project, 'spec', 'outdir'))).toBe(false)
  })

  it('refuses a destination folder that is a symlink pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await copyProjectEntry(project, 'Gemfile', 'outdir')).success).toBe(false)
    expect(existsSync(join(outside, 'Gemfile'))).toBe(false)
  })

  it('refuses a destination that is a file', async () => {
    expect((await copyProjectEntry(project, 'spec/login_spec.rb', 'Gemfile')).success).toBe(false)
  })

  it('skips symlinks inside a copied folder, wherever they point', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'spec', 'out.txt'))
    await symlink(outside, join(project, 'spec', 'outdir'))
    await symlink(join(project, 'Gemfile'), join(project, 'spec', 'in.txt'))
    const res = await copyProjectEntry(project, 'spec', '')
    expect(res).toEqual({ success: true, path: 'spec_copy', skipped: 3 })
    expect((await readdir(join(project, 'spec_copy'))).sort()).toEqual(['login_spec.rb', 'pages'])
    expect(await read('spec_copy/pages/home.rb')).toBe('home')
  })

  it('fails when the source does not exist', async () => {
    expect((await copyProjectEntry(project, 'nope.rb', '')).success).toBe(false)
  })
})

describe('renameProjectEntry', () => {
  it('renames a file in its folder', async () => {
    expect(await renameProjectEntry(project, 'spec/login_spec.rb', 'auth_spec.rb')).toEqual({
      success: true,
      path: 'spec/auth_spec.rb'
    })
    expect(await read('spec/auth_spec.rb')).toBe('login')
  })

  it('renames a folder', async () => {
    expect(await renameProjectEntry(project, 'spec/pages', 'screens')).toMatchObject({
      success: true,
      path: 'spec/screens'
    })
  })

  it('never renames a folder onto an existing file or folder', async () => {
    await mkdir(join(project, 'spec', 'screens'))
    expect(await renameProjectEntry(project, 'spec/pages', 'screens')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await renameProjectEntry(project, 'spec/pages', 'login_spec.rb')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await read('spec/pages/home.rb')).toBe('home')
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it('never overwrites an existing entry', async () => {
    await writeFile(join(project, 'spec', 'other.rb'), 'other')
    expect(await renameProjectEntry(project, 'spec/login_spec.rb', 'other.rb')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await read('spec/other.rb')).toBe('other')
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it.each(['', '..', '.', 'a/b', '..\\b', '../../evil'])('refuses the name %j', async (name) => {
    expect(await renameProjectEntry(project, 'Gemfile', name)).toMatchObject({
      success: false,
      code: 'invalidName'
    })
    expect(await read('Gemfile')).toBe('gems')
  })

  it('refuses the root, traversal and absolute paths', async () => {
    for (const rel of ['', '..', '../x', join(project, 'Gemfile')]) {
      expect((await renameProjectEntry(project, rel, 'x')).success).toBe(false)
    }
    expect(await read('Gemfile')).toBe('gems')
  })

  it('renames a symlink pointing outside as a link, never touching its target', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    expect((await renameProjectEntry(project, 'secret.txt', 'renamed.txt')).success).toBe(true)
    expect((await lstat(join(project, 'renamed.txt'))).isSymbolicLink()).toBe(true)
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true)
    expect(existsSync(join(outside, 'renamed.txt'))).toBe(false)
  })

  it('refuses an entry reached through a symlinked folder pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await renameProjectEntry(project, 'outdir/secret.txt', 'x.txt')).success).toBe(false)
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true)
  })
})

describe('trashProjectEntry', () => {
  it('moves a file to the OS Trash and never deletes it with fs', async () => {
    expect(await trashProjectEntry(project, 'spec/login_spec.rb')).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(join(project, 'spec', 'login_spec.rb'))
    for (const spy of deletions) expect(spy).not.toHaveBeenCalled()
    // The mocked Trash does nothing, so the file must still be there
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it('trashes a folder the same way', async () => {
    expect(await trashProjectEntry(project, 'spec')).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(join(project, 'spec'))
    expect(existsSync(join(project, 'spec', 'pages', 'home.rb'))).toBe(true)
  })

  it('never trashes the project root, traversal or absolute paths', async () => {
    for (const rel of ['', '.', '..', '../x', 'spec/../..', project, join(outside, 'secret.txt')]) {
      expect((await trashProjectEntry(project, rel)).success).toBe(false)
    }
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('trashes a symlink pointing outside as the link itself', async () => {
    await symlink(join(outside, 'secret.txt'), join(project, 'secret.txt'))
    expect((await trashProjectEntry(project, 'secret.txt')).success).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(join(project, 'secret.txt'))
  })

  it('refuses an entry reached through a symlinked folder pointing outside', async () => {
    await symlink(outside, join(project, 'outdir'))
    expect((await trashProjectEntry(project, 'outdir/secret.txt')).success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('reports a missing entry', async () => {
    expect((await trashProjectEntry(project, 'nope.rb')).success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('reports a Trash failure', async () => {
    trashItem.mockRejectedValueOnce(new Error('no trash here'))
    expect(await trashProjectEntry(project, 'Gemfile')).toMatchObject({ success: false })
  })
})

describe('every handler', () => {
  const all = (rel: string, name = 'x.rb'): Promise<{ success: boolean; code?: string }>[] => [
    createProjectEntry(project, rel, name, 'file'),
    copyProjectEntry(project, rel, ''),
    copyProjectEntry(project, 'Gemfile', rel),
    duplicateProjectEntry(project, rel),
    renameProjectEntry(project, rel, name),
    trashProjectEntry(project, rel)
  ]

  it('refuses a call made for another project than the open one', async () => {
    const other = await mkdtemp(join(tmpdir(), 'raider-files-other-'))
    try {
      const results = await Promise.all([
        createProjectEntry(other, '', 'a.rb', 'file'),
        copyProjectEntry(other, 'Gemfile', ''),
        duplicateProjectEntry(other, 'Gemfile'),
        renameProjectEntry(other, 'Gemfile', 'b'),
        trashProjectEntry(other, 'Gemfile')
      ])
      for (const res of results)
        expect(res).toMatchObject({ success: false, code: 'projectChanged' })
      expect(trashItem).not.toHaveBeenCalled()
      expect(existsSync(join(project, 'a.rb'))).toBe(false)
      expect(await read('Gemfile')).toBe('gems')
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })

  it('refuses .git and .raider anywhere in a path, in any case', async () => {
    await mkdir(join(project, '.git', 'hooks'), { recursive: true })
    await mkdir(join(project, '.raider', 'tests'), { recursive: true })
    await writeFile(join(project, '.git', 'config'), 'c')
    for (const rel of [
      '.git',
      '.git/config',
      '.GIT/config',
      '.raider',
      '.Raider/tests',
      '.git/hooks'
    ]) {
      for (const res of await Promise.all(all(rel))) expect(res.success).toBe(false)
    }
    for (const name of ['.git', '.RAIDER']) {
      expect(await createProjectEntry(project, '', name, 'folder')).toMatchObject({
        success: false,
        code: 'invalidName'
      })
      expect((await renameProjectEntry(project, 'Gemfile', name)).success).toBe(false)
    }
    expect(trashItem).not.toHaveBeenCalled()
    expect(await read('.git/config')).toBe('c')
  })

  it('refuses Windows-hostile new names', async () => {
    for (const name of ['CON', 'nul.rb', 'a:b', 'a?', 'trailing.', 'trailing ', 'tab\there']) {
      expect(await createProjectEntry(project, '', name, 'file')).toMatchObject({
        success: false,
        code: 'invalidName'
      })
      expect(await renameProjectEntry(project, 'Gemfile', name)).toMatchObject({
        success: false,
        code: 'invalidName'
      })
    }
    expect(await read('Gemfile')).toBe('gems')
  })

  it('still reaches existing entries with odd names, so they can be renamed or trashed', async () => {
    for (const [i, odd] of ['foo?.rb', 'bar.', 'aux.rb', 'Icon\r'].entries()) {
      await writeFile(join(project, 'spec', odd), 'odd')
      expect(await renameProjectEntry(project, `spec/${odd}`, `fixed${i}.rb`)).toMatchObject({
        success: true,
        path: `spec/fixed${i}.rb`
      })
      await writeFile(join(project, 'spec', odd), 'odd')
      expect((await trashProjectEntry(project, `spec/${odd}`)).success).toBe(true)
    }
    // An odd folder can be written into; a copy may not take an odd name of its own
    await mkdir(join(project, 'odd?'))
    expect((await createProjectEntry(project, 'odd?', 'a.rb', 'file')).success).toBe(true)
    await writeFile(join(project, 'what?.rb'), 'w')
    expect(await copyProjectEntry(project, 'what?.rb', 'spec')).toMatchObject({
      success: false,
      code: 'invalidName'
    })
  })

  it('skips entries with names other systems refuse inside a copied folder', async () => {
    await writeFile(join(project, 'spec', 'Icon\r'), 'icon')
    const res = await copyProjectEntry(project, 'spec', '')
    expect(res).toMatchObject({ success: true, path: 'spec_copy', skipped: 1 })
    expect(existsSync(join(project, 'spec_copy', 'Icon\r'))).toBe(false)
    expect(await read('spec_copy/login_spec.rb')).toBe('login')
  })

  it('refuses .git and .raider reached through a link with another name', async () => {
    await mkdir(join(project, '.git'))
    await writeFile(join(project, '.git', 'config'), 'c')
    await symlink(join(project, '.git'), join(project, 'gitlink'))
    for (const res of await Promise.all(all('gitlink/config'))) expect(res.success).toBe(false)
    expect((await createProjectEntry(project, 'gitlink', 'hook', 'file')).success).toBe(false)
    expect(existsSync(join(project, '.git', 'hook'))).toBe(false)
    expect(await read('.git/config')).toBe('c')
  })
})

describe('recorded tests', () => {
  const recordSidecar = async (fileRel: string): Promise<void> => {
    const file = join(project, '.raider', 'tests', `${fileRel}.json`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, '{}')
  }

  it('refuses to rename or trash a recorded spec, or a folder holding one', async () => {
    await recordSidecar('spec/login_spec.rb')
    for (const rel of ['spec/login_spec.rb', 'spec']) {
      expect(await renameProjectEntry(project, rel, 'other')).toMatchObject({
        success: false,
        code: 'recorded'
      })
      expect(await trashProjectEntry(project, rel)).toMatchObject({
        success: false,
        code: 'recorded'
      })
    }
    expect(trashItem).not.toHaveBeenCalled()
    expect(await read('spec/login_spec.rb')).toBe('login')
  })

  it('refuses to rename or trash a recorded flow, or the flows folder holding it', async () => {
    await mkdir(join(project, 'flows'))
    await writeFile(join(project, 'flows', 'fill_flow.rb'), 'flow')
    await recordSidecar('flows/fill_flow.rb')
    for (const rel of ['flows/fill_flow.rb', 'flows']) {
      expect(await renameProjectEntry(project, rel, 'other')).toMatchObject({
        success: false,
        code: 'recorded'
      })
      expect(await trashProjectEntry(project, rel)).toMatchObject({
        success: false,
        code: 'recorded'
      })
    }
    expect(trashItem).not.toHaveBeenCalled()
    expect(await read('flows/fill_flow.rb')).toBe('flow')
  })

  it('still renames and trashes what is not recorded, even next to a recorded spec', async () => {
    await recordSidecar('spec/login_spec.rb')
    expect((await renameProjectEntry(project, 'spec/pages', 'screens')).success).toBe(true)
    expect((await trashProjectEntry(project, 'Gemfile')).success).toBe(true)
    // A folder whose name only starts like the recorded one's is not holding it
    await mkdir(join(project, 'spec2'))
    expect((await trashProjectEntry(project, 'spec2')).success).toBe(true)
  })

  it('refuses a recorded spec reached through a link to its folder', async () => {
    await recordSidecar('spec/login_spec.rb')
    await symlink(join(project, 'spec'), join(project, 'speclink'))
    expect(await trashProjectEntry(project, 'speclink/login_spec.rb')).toMatchObject({
      success: false,
      code: 'recorded'
    })
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('never lands a new entry on the path of a recorded test whose file is missing', async () => {
    await recordSidecar('spec/gone_spec.rb')
    await recordSidecar('lost/x_spec.rb')
    expect(await createProjectEntry(project, 'spec', 'gone_spec.rb', 'file')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await createProjectEntry(project, '', 'lost', 'folder')).toMatchObject({
      success: false,
      code: 'exists'
    })
    expect(await renameProjectEntry(project, 'spec/login_spec.rb', 'gone_spec.rb')).toMatchObject({
      success: false,
      code: 'exists'
    })
    // A paste moves on to the next free name
    await mkdir(join(project, 'other'))
    await writeFile(join(project, 'other', 'gone_spec.rb'), 'g')
    expect(await copyProjectEntry(project, 'other/gone_spec.rb', 'spec')).toMatchObject({
      success: true,
      path: 'spec/gone_copy_spec.rb'
    })
    expect(existsSync(join(project, 'spec', 'gone_spec.rb'))).toBe(false)
  })

  it('still copies and duplicates a recorded spec', async () => {
    await recordSidecar('spec/login_spec.rb')
    expect((await duplicateProjectEntry(project, 'spec/login_spec.rb')).success).toBe(true)
  })
})

describe('copy limits', () => {
  it('refuses a folder with too many entries before copying anything', async () => {
    await mkdir(join(project, 'big'))
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => writeFile(join(project, 'big', `f${i}.txt`), 'x'))
    )
    const res = await copyProjectEntry(project, 'big', '', { maxEntries: 20 })
    expect(res).toMatchObject({ success: false, code: 'tooLarge' })
    expect(existsSync(join(project, 'big_copy'))).toBe(false)
  })

  it('refuses a copy that is too many bytes before copying anything', async () => {
    await writeFile(join(project, 'large.bin'), Buffer.alloc(2048))
    const res = await duplicateProjectEntry(project, 'large.bin', { maxBytes: 1024 })
    expect(res).toMatchObject({ success: false, code: 'tooLarge' })
    expect(existsSync(join(project, 'large_copy.bin'))).toBe(false)
  })
})
