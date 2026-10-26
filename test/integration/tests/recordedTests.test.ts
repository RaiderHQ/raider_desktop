import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  slugify,
  saveRecordedTest,
  deleteRecordedTest,
  findSidecarById,
  CodeOwnedError
} from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar, writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import { hashRuby } from '../../../src/main/handlers/tests/codeHash'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Test } from '../../../src/shared/types/test'
import type { Step } from '../../../src/shared/types/step'

let project: string

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const steps = (n: number): Step[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    kind: 'navigate' as const,
    url: `https://x.test/${i}`
  }))

const test = (over: Partial<Test> = {}): Test => ({
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  steps: steps(1),
  ...over
})

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-recorded-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
})

describe('slugify', () => {
  it('slug is safe', () => {
    expect(slugify('Login "admin" / ../x 🎉')).toBe('login_admin_x')
    expect(slugify('测试')).toBe('recorded_test')
    const long = slugify('a'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(60)
    expect(long).toMatch(/^[a-z0-9_]+$/)
  })
})

describe('recorded tests', () => {
  it('first save creates file and sidecar', async () => {
    const sidecar = await saveRecordedTest(project, layout, test())
    expect(sidecar.file).toBe('spec/checkout_spec.rb')
    const content = await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')
    expect(hashRuby(content)).toBe(sidecar.hash)
    expect(await readSidecar(project, 'spec/checkout_spec.rb')).toEqual(sidecar)
  })

  it('name clash appends suffix', async () => {
    await mkdir(join(project, 'spec'))
    const handWritten = "describe 'mine' do\nend\n"
    await writeFile(join(project, 'spec', 'checkout_spec.rb'), handWritten)
    const sidecar = await saveRecordedTest(project, layout, test())
    expect(sidecar.file).toBe('spec/checkout_2_spec.rb')
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toBe(handWritten)
  })

  it('rename keeps file name', async () => {
    const first = await saveRecordedTest(project, layout, test())
    const second = await saveRecordedTest(project, layout, test({ name: 'Pay now' }))
    expect(second.file).toBe(first.file)
    expect(second.createdAt).toBe(first.createdAt)
    const content = await readFile(join(project, first.file), 'utf-8')
    expect(content).toContain("describe 'Pay now'")
    expect(await exists(join(project, 'spec', 'pay_now_spec.rb'))).toBe(false)
  })

  it('edited file becomes code-owned', async () => {
    const sidecar = await saveRecordedTest(project, layout, test())
    const file = join(project, sidecar.file)
    const edited = (await readFile(file, 'utf-8')) + "puts 'hand edit'\n"
    await writeFile(file, edited)
    await expect(
      saveRecordedTest(project, layout, test({ steps: steps(3) }))
    ).rejects.toBeInstanceOf(CodeOwnedError)
    expect((await readSidecar(project, sidecar.file))?.codeOwned).toBe(true)
    expect(await readFile(file, 'utf-8')).toBe(edited)
    // Once code-owned, later saves are refused even if the file is reverted
    await expect(saveRecordedTest(project, layout, test())).rejects.toBeInstanceOf(CodeOwnedError)
  })

  it('missing file with a sidecar is regenerated', async () => {
    const sidecar = await saveRecordedTest(project, layout, test())
    await rm(join(project, sidecar.file))
    const again = await saveRecordedTest(project, layout, test())
    expect(again.file).toBe(sidecar.file)
    expect(hashRuby(await readFile(join(project, sidecar.file), 'utf-8'))).toBe(again.hash)
  })

  it('concurrent saves serialize', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        saveRecordedTest(project, layout, test({ steps: steps(i + 1) }))
      )
    )
    const sidecar = await readSidecar(project, 'spec/checkout_spec.rb')
    const content = await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')
    expect(sidecar?.steps).toHaveLength(10)
    expect(hashRuby(content)).toBe(sidecar?.hash)
    const all = await walk(project)
    expect(all.filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(all.filter((f) => f.endsWith('_spec.rb'))).toHaveLength(1)
  })

  it('different new tests with the same name get distinct files', async () => {
    const saved = await Promise.all(
      Array.from({ length: 5 }, (_, i) => saveRecordedTest(project, layout, test({ id: `t${i}` })))
    )
    expect(new Set(saved.map((s) => s.file)).size).toBe(5)
  })

  it('path traversal rejected', async () => {
    const evil = {
      version: 1 as const,
      id: 'evil',
      name: 'Evil',
      url: 'https://x.test',
      steps: steps(1),
      file: '../../etc/x_spec.rb',
      automation: 'selenium' as const,
      hash: 'x',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z'
    }
    // Stored under an innocent location but claiming a file outside the project
    await mkdir(join(project, '.raider', 'tests', 'spec'), { recursive: true })
    await writeFile(
      join(project, '.raider', 'tests', 'spec', 'x_spec.rb.json'),
      JSON.stringify(evil)
    )
    expect(await findSidecarById(project, 'evil')).toBeNull()
    await expect(writeSidecar(project, evil)).rejects.toThrow()
    // A save for that id treats it as new and stays inside spec/
    const saved = await saveRecordedTest(project, layout, test({ id: 'evil', name: 'X' }))
    expect(saved.file.startsWith('spec/')).toBe(true)
    expect(await exists(join(project, '..', '..', 'etc', 'x_spec.rb'))).toBe(false)
  })

  it('refuses a spec dir symlinked outside the project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'raider-outside-'))
    try {
      await symlink(outside, join(project, 'spec'))
      await expect(saveRecordedTest(project, layout, test())).rejects.toThrow()
      expect(await readdir(outside)).toEqual([])
      expect(await findSidecarById(project, 't1')).toBeNull()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('delete removes file and sidecar', async () => {
    const sidecar = await saveRecordedTest(project, layout, test())
    await deleteRecordedTest(project, 't1')
    expect(await exists(join(project, sidecar.file))).toBe(false)
    expect(await readSidecar(project, sidecar.file)).toBeNull()
  })

  it('delete refuses code-owned', async () => {
    const sidecar = await saveRecordedTest(project, layout, test())
    const file = join(project, sidecar.file)
    const edited = (await readFile(file, 'utf-8')) + "puts 'hand edit'\n"
    await writeFile(file, edited)
    // Edited but never re-saved: delete must still notice and refuse
    await expect(deleteRecordedTest(project, 't1')).rejects.toBeInstanceOf(CodeOwnedError)
    expect(await readFile(file, 'utf-8')).toBe(edited)
    expect((await readSidecar(project, sidecar.file))?.codeOwned).toBe(true)
    await expect(deleteRecordedTest(project, 't1')).rejects.toBeInstanceOf(CodeOwnedError)
    expect(await exists(file)).toBe(true)
  })

  it('spec_path change keeps updating the file at its old location', async () => {
    const first = await saveRecordedTest(project, layout, test())
    const moved = { ...layout, specPath: 'test/spec' }
    const second = await saveRecordedTest(project, moved, test({ name: 'Moved' }))
    expect(second.file).toBe(first.file)
    expect(await readFile(join(project, first.file), 'utf-8')).toContain("describe 'Moved'")
    // New tests go to the new folder
    const other = await saveRecordedTest(project, moved, test({ id: 't2', name: 'Other' }))
    expect(other.file).toBe('test/spec/other_spec.rb')
  })

  it('creates and restores files on volumes without hard links', async () => {
    const noLink = Object.assign(new Error('not supported'), { code: 'ENOTSUP' })
    const link = vi.spyOn(fs, 'link').mockRejectedValue(noLink)
    const sidecar = await saveRecordedTest(project, layout, test())
    expect(link).toHaveBeenCalled()
    const file = join(project, sidecar.file)
    expect(hashRuby(await readFile(file, 'utf-8'))).toBe(sidecar.hash)
    await rm(file)
    const restored = await saveRecordedTest(project, layout, test({ steps: steps(2) }))
    expect(hashRuby(await readFile(file, 'utf-8'))).toBe(restored.hash)
    // The fallback still never replaces a hand-written file
    await writeFile(join(project, 'spec', 'other_spec.rb'), "puts 'mine'\n")
    const other = await saveRecordedTest(project, layout, test({ id: 't2', name: 'Other' }))
    expect(other.file).toBe('spec/other_2_spec.rb')
    expect(await readFile(join(project, 'spec', 'other_spec.rb'), 'utf-8')).toBe("puts 'mine'\n")
    const all = await walk(project)
    expect(all.filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('a sidecar with a matching hash cannot claim a hand-written spec', async () => {
    await mkdir(join(project, 'spec'))
    const handWritten = "describe 'login' do\n  it 'works' do\n  end\nend\n"
    const file = join(project, 'spec', 'login_spec.rb')
    await writeFile(file, handWritten)
    await writeSidecar(project, {
      version: 1,
      id: 'x',
      name: 'Login',
      url: 'https://x.test',
      steps: steps(1),
      file: 'spec/login_spec.rb',
      automation: 'selenium',
      hash: hashRuby(handWritten),
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z'
    })
    await expect(saveRecordedTest(project, layout, test({ id: 'x' }))).rejects.toBeInstanceOf(
      CodeOwnedError
    )
    expect(await readFile(file, 'utf-8')).toBe(handWritten)
    expect((await readSidecar(project, 'spec/login_spec.rb'))?.codeOwned).toBe(true)
    await expect(deleteRecordedTest(project, 'x')).rejects.toBeInstanceOf(CodeOwnedError)
    expect(await readFile(file, 'utf-8')).toBe(handWritten)
  })

  it('a hand-written spec is refused by delete even before any save', async () => {
    await mkdir(join(project, 'spec'))
    const handWritten = "describe 'pay' do\nend\n"
    const file = join(project, 'spec', 'pay_spec.rb')
    await writeFile(file, handWritten)
    await writeSidecar(project, {
      version: 1,
      id: 'y',
      name: 'Pay',
      url: 'https://x.test',
      steps: steps(1),
      file: 'spec/pay_spec.rb',
      automation: 'selenium',
      hash: hashRuby(handWritten),
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z'
    })
    await expect(deleteRecordedTest(project, 'y')).rejects.toBeInstanceOf(CodeOwnedError)
    expect(await readFile(file, 'utf-8')).toBe(handWritten)
  })

  it('a broken link at the candidate name is skipped', async () => {
    await mkdir(join(project, 'spec'))
    await symlink(join(project, 'nowhere'), join(project, 'spec', 'checkout_spec.rb'))
    const sidecar = await saveRecordedTest(project, layout, test())
    expect(sidecar.file).toBe('spec/checkout_2_spec.rb')
  })

  it('saves through different spellings of the project path serialize', async () => {
    const spellings = [project, `${project}/`, join(project, '.')]
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        saveRecordedTest(spellings[i % 3], layout, test({ steps: steps(i + 1) }))
      )
    )
    const all = await walk(project)
    expect(all.filter((f) => f.endsWith('_spec.rb'))).toHaveLength(1)
    const sidecar = await readSidecar(project, 'spec/checkout_spec.rb')
    expect(sidecar?.steps).toHaveLength(9)
    expect(hashRuby(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8'))).toBe(
      sidecar?.hash
    )
  })
})
