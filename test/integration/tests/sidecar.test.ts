import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  sidecarPath,
  readSidecar,
  writeSidecar,
  deleteSidecar,
  listSidecars,
  SidecarUnreadableError
} from '../../../src/main/handlers/tests/sidecar'
import type { Sidecar } from '../../../src/shared/types/projectTest'

let project: string
const testsDir = (): string => join(project, '.raider', 'tests')

const sidecar = (file: string, over: Partial<Sidecar> = {}): Sidecar => ({
  version: 1,
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://x.test' }],
  file,
  automation: 'selenium',
  hash: 'abc',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  ...over
})

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-sidecar-'))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('sidecar store', () => {
  it('sidecarPath lives under .raider/tests', () => {
    expect(sidecarPath(project, 'spec/a_spec.rb')).toBe(join(testsDir(), 'spec', 'a_spec.rb.json'))
  })

  it('sidecarPath rejects traversal', () => {
    expect(() => sidecarPath(project, '../../etc/x_spec.rb')).toThrow()
  })

  it('round-trips a sidecar', async () => {
    const s = sidecar('spec/a_spec.rb')
    await writeSidecar(project, s)
    expect(await readSidecar(project, 'spec/a_spec.rb')).toEqual(s)
  })

  it('round-trips a locator and still loads a sidecar written without one', async () => {
    const locator = { by: 'role' as const, role: 'button', name: 'Log in' }
    const withLocator = sidecar('spec/a_spec.rb', {
      steps: [{ id: 's1', kind: 'click', element: { strategy: 'id', value: 'go', locator } }]
    })
    await writeSidecar(project, withLocator)
    expect(await readSidecar(project, 'spec/a_spec.rb')).toEqual(withLocator)

    const old = sidecar('spec/b_spec.rb', {
      steps: [{ id: 's1', kind: 'click', element: { strategy: 'id', value: 'go' } }]
    })
    await writeSidecar(project, old)
    expect(await readSidecar(project, 'spec/b_spec.rb')).toEqual(old)
  })

  it('readSidecar names old secret steps once, in order', async () => {
    const pw = { strategy: 'id' as const, value: 'pw' }
    const old = sidecar('spec/a_spec.rb', {
      steps: [
        { id: 'a', kind: 'type', element: pw, text: '', secret: true },
        { id: 'b', kind: 'type', element: pw, text: '', secret: true }
      ]
    })
    await writeSidecar(project, old)
    const read = await readSidecar(project, 'spec/a_spec.rb')
    expect(read!.steps.map((s) => (s.kind === 'type' ? s.secretName : undefined))).toEqual([
      'RAIDER_SECRET_1',
      'RAIDER_SECRET_2'
    ])
  })

  it('readSidecar refuses a secret step that reads a variable other than RAIDER_SECRET_', async () => {
    const pw = { strategy: 'id' as const, value: 'pw' }
    const bad = sidecar('spec/a_spec.rb', {
      steps: [
        { id: 'a', kind: 'type', element: pw, text: '', secret: true, secretName: 'GITHUB_TOKEN' }
      ]
    })
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    await writeFile(sidecarPath(project, 'spec/a_spec.rb'), JSON.stringify(bad))
    const error = await readSidecar(project, 'spec/a_spec.rb').catch((e: Error) => e)
    expect(error).toBeInstanceOf(SidecarUnreadableError)
    expect((error as Error).message).toContain('GITHUB_TOKEN')
    expect((error as Error).message).toContain('RAIDER_SECRET_')
  })

  it('readSidecar returns null when missing', async () => {
    expect(await readSidecar(project, 'spec/none_spec.rb')).toBeNull()
  })

  it('readSidecar throws SidecarUnreadableError on a bad shape', async () => {
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    await writeFile(
      join(testsDir(), 'spec', 'a_spec.rb.json'),
      JSON.stringify({ ...sidecar('spec/a_spec.rb'), steps: [{ kind: 'nope' }] })
    )
    await expect(readSidecar(project, 'spec/a_spec.rb')).rejects.toBeInstanceOf(
      SidecarUnreadableError
    )
  })

  it('unreadable sidecar is listed with an error', async () => {
    await writeSidecar(project, sidecar('spec/good_spec.rb'))
    await writeFile(join(testsDir(), 'spec', 'bad_spec.rb.json'), '{ not json')
    await writeFile(join(testsDir(), 'spec', 'leftover_spec.rb.json.1.tmp'), '{}')
    const list = await listSidecars(project)
    const byRel = Object.fromEntries(list.map((e) => [e.fileRel, e]))
    expect(Object.keys(byRel).sort()).toEqual(['spec/bad_spec.rb', 'spec/good_spec.rb'])
    expect(byRel['spec/bad_spec.rb'].sidecar).toBeNull()
    expect(byRel['spec/bad_spec.rb'].error).toEqual(expect.any(String))
    expect(byRel['spec/good_spec.rb'].sidecar?.id).toBe('t1')
  })

  it('listSidecars is empty without a tests dir', async () => {
    expect(await listSidecars(project)).toEqual([])
  })

  it('deleteSidecar removes it and ignores a missing one', async () => {
    await writeSidecar(project, sidecar('spec/a_spec.rb'))
    await deleteSidecar(project, 'spec/a_spec.rb')
    expect(await readSidecar(project, 'spec/a_spec.rb')).toBeNull()
    await expect(deleteSidecar(project, 'spec/a_spec.rb')).resolves.toBeUndefined()
  })

  it('refuses to write through a .raider symlink pointing outside the project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'raider-outside-'))
    try {
      await symlink(outside, join(project, '.raider'))
      await expect(writeSidecar(project, sidecar('spec/a_spec.rb'))).rejects.toThrow()
      expect(await readdir(outside)).toEqual([])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('leaves no tmp files after concurrent writes', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writeSidecar(project, sidecar('spec/a_spec.rb', { name: `n${i}` }))
      )
    )
    const files = await readdir(join(testsDir(), 'spec'))
    expect(files).toEqual(['a_spec.rb.json'])
    expect(
      JSON.parse(await readFile(join(testsDir(), 'spec', 'a_spec.rb.json'), 'utf-8')).name
    ).toBe('n9')
  })
})
