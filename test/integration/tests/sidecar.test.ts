import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
import { isStep } from '../../../src/shared/types/step'

vi.mock('../../../src/main/utils/safeLog', () => ({
  safeError: vi.fn(),
  safeLog: vi.fn(),
  safeWarn: vi.fn()
}))
import { safeWarn } from '../../../src/main/utils/safeLog'

let project: string
const testsDir = (): string => join(project, '.raider', 'tests')

const sidecar = (file: string, over: Partial<Sidecar> = {}): Sidecar => ({
  version: 1,
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://x.test' }],
  file,
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

  it('round-trips a well-formed step map', async () => {
    const s = sidecar('spec/a_spec.rb', {
      stepLines: { fileSha256: 'f00d', ranges: [{ stepId: 's1', start: 7, end: 8 }] }
    })
    await writeSidecar(project, s)
    expect(await readSidecar(project, 'spec/a_spec.rb')).toEqual(s)
  })

  it('reads ranges with and without a title; drops a non-string title only', async () => {
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    const stepLines = {
      fileSha256: 'f',
      ranges: [
        { stepId: 's1', start: 1, end: 2, title: 'Open x' },
        { stepId: 's2', start: 3, end: 4 },
        { stepId: 's3', start: 5, end: 6, title: 7 }
      ]
    }
    await writeFile(
      sidecarPath(project, 'spec/a_spec.rb'),
      JSON.stringify({ ...sidecar('spec/a_spec.rb'), stepLines })
    )
    const read = await readSidecar(project, 'spec/a_spec.rb')
    expect(read?.stepLines?.ranges).toEqual([
      { stepId: 's1', start: 1, end: 2, title: 'Open x' },
      { stepId: 's2', start: 3, end: 4 },
      { stepId: 's3', start: 5, end: 6 }
    ])
  })

  it('drops a malformed step map and still reads the sidecar', async () => {
    const bad = [
      { fileSha256: 1, ranges: 'x' },
      { fileSha256: 'f', ranges: [{ stepId: 's1', start: 0, end: 1 }] },
      { fileSha256: 'f', ranges: [{ stepId: 's1', start: 3, end: 2 }] },
      { fileSha256: 'f', ranges: [{ stepId: 's1', start: 1.5, end: 2 }] },
      { fileSha256: 'f', ranges: [{ stepId: 2, start: 1, end: 2 }] },
      'nope'
    ]
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    for (const stepLines of bad) {
      await writeFile(
        sidecarPath(project, 'spec/a_spec.rb'),
        JSON.stringify({ ...sidecar('spec/a_spec.rb'), stepLines })
      )
      const read = await readSidecar(project, 'spec/a_spec.rb')
      expect(read).toEqual(sidecar('spec/a_spec.rb'))
      expect(read).not.toHaveProperty('stepLines')
    }
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

  it('round-trips the codegen version and still loads a sidecar written without one', async () => {
    await writeSidecar(project, sidecar('spec/a_spec.rb', { codegen: 2 }))
    expect((await readSidecar(project, 'spec/a_spec.rb'))?.codegen).toBe(2)
    // A 3.x sidecar: no codegen, and an automation field this version no longer knows
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    await writeFile(
      join(testsDir(), 'spec', 'old_spec.rb.json'),
      JSON.stringify({ ...sidecar('spec/old_spec.rb'), automation: 'selenium' })
    )
    const old = await readSidecar(project, 'spec/old_spec.rb')
    expect(old?.codegen).toBeUndefined()
    expect(old?.name).toBe('Checkout')
  })

  it.each([0, 1.5, '2'])('refuses a sidecar whose codegen is %j', async (codegen) => {
    await mkdir(join(testsDir(), 'spec'), { recursive: true })
    await writeFile(
      join(testsDir(), 'spec', 'a_spec.rb.json'),
      JSON.stringify({ ...sidecar('spec/a_spec.rb'), codegen })
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

describe('sidecar tags', () => {
  it('round-trips tags', async () => {
    const s = sidecar('spec/a_spec.rb', { tags: ['api', 'smoke'] })
    await writeSidecar(project, s)
    expect((await readSidecar(project, 'spec/a_spec.rb'))?.tags).toEqual(['api', 'smoke'])
  })

  it('drops invalid entries on read and keeps the test', async () => {
    await writeSidecar(project, sidecar('spec/a_spec.rb'))
    const path = sidecarPath(project, 'spec/a_spec.rb')
    const raw = JSON.parse(await readFile(path, 'utf-8'))
    await writeFile(path, JSON.stringify({ ...raw, tags: ['Smoke', 3, 'bad tag', 'smoke', 'a'] }))
    expect((await readSidecar(project, 'spec/a_spec.rb'))?.tags).toEqual(['a', 'smoke'])
    await writeFile(path, JSON.stringify({ ...raw, tags: ['!!'] }))
    expect((await readSidecar(project, 'spec/a_spec.rb'))?.tags).toBeUndefined()
  })

  it('refuses a sidecar whose tags are not an array', async () => {
    await writeSidecar(project, sidecar('spec/a_spec.rb'))
    const path = sidecarPath(project, 'spec/a_spec.rb')
    const raw = JSON.parse(await readFile(path, 'utf-8'))
    await writeFile(path, JSON.stringify({ ...raw, tags: 'smoke' }))
    await expect(readSidecar(project, 'spec/a_spec.rb')).rejects.toThrow(SidecarUnreadableError)
  })
})

describe('flow sidecars', () => {
  const field = { strategy: 'id' as const, value: 'hours' }
  const rewrite = async (
    file: string,
    patch: (raw: Record<string, unknown>) => object
  ): Promise<void> => {
    const path = sidecarPath(project, file)
    const raw = JSON.parse(await readFile(path, 'utf-8'))
    await writeFile(path, JSON.stringify(patch(raw)))
  }

  it('round-trips kind, inputs and a step input name', async () => {
    const s = sidecar('flows/fill_flow.rb', {
      kind: 'flow',
      inputs: [{ name: 'hours', default: '8' }],
      steps: [{ id: 's1', kind: 'type', element: field, text: '8', inputName: 'hours' }]
    })
    await writeSidecar(project, s)
    const raw = JSON.parse(await readFile(sidecarPath(project, 'flows/fill_flow.rb'), 'utf-8'))
    expect(raw.kind).toBe('flow')
    expect(raw.inputs).toEqual([{ name: 'hours', default: '8' }])
    expect(await readSidecar(project, 'flows/fill_flow.rb')).toEqual(s)
  })

  it('reads a sidecar without kind as it was written: no kind added', async () => {
    const s = sidecar('spec/a_spec.rb')
    await writeSidecar(project, s)
    const read = await readSidecar(project, 'spec/a_spec.rb')
    expect(read).toEqual(s)
    expect(read).not.toHaveProperty('kind')
  })

  it('treats an unknown kind as a test and warns', async () => {
    vi.mocked(safeWarn).mockClear()
    await writeSidecar(project, sidecar('spec/a_spec.rb'))
    await rewrite('spec/a_spec.rb', (raw) => ({ ...raw, kind: 'macro' }))
    const read = await readSidecar(project, 'spec/a_spec.rb')
    expect(read).toEqual(sidecar('spec/a_spec.rb'))
    expect(read).not.toHaveProperty('kind')
    expect(safeWarn).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(safeWarn).mock.calls[0].join(' '))).toContain('spec/a_spec.rb')
  })

  it('drops bad inputs entries one by one', async () => {
    await writeSidecar(project, sidecar('flows/a_flow.rb', { kind: 'flow' }))
    await rewrite('flows/a_flow.rb', (raw) => ({
      ...raw,
      inputs: [
        { name: 'hours', default: '8' },
        { name: 'Hours', default: '8' },
        { name: 'date', default: 3 },
        'x',
        null,
        { name: 'hours', default: '9' },
        { name: 'note', default: '' }
      ]
    }))
    expect((await readSidecar(project, 'flows/a_flow.rb'))?.inputs).toEqual([
      { name: 'hours', default: '8' },
      { name: 'note', default: '' }
    ])
  })

  it('drops inputs that are not an array, or left empty, and keeps the flow', async () => {
    await writeSidecar(project, sidecar('flows/a_flow.rb', { kind: 'flow' }))
    await rewrite('flows/a_flow.rb', (raw) => ({ ...raw, inputs: 'hours' }))
    const read = await readSidecar(project, 'flows/a_flow.rb')
    expect(read?.kind).toBe('flow')
    expect(read).not.toHaveProperty('inputs')
    await rewrite('flows/a_flow.rb', (raw) => ({ ...raw, inputs: [{ name: '1x', default: '' }] }))
    expect(await readSidecar(project, 'flows/a_flow.rb')).not.toHaveProperty('inputs')
  })

  it('drops an input name that fails the rule and keeps the step', async () => {
    const good = { id: 'g', kind: 'type' as const, element: field, text: 'a', inputName: 'ok' }
    await writeSidecar(project, sidecar('flows/a_flow.rb', { kind: 'flow', steps: [good] }))
    await rewrite('flows/a_flow.rb', (raw) => ({
      ...raw,
      steps: [
        good,
        { id: 'b', kind: 'type', element: field, text: '8', inputName: 'Bad Name' },
        { id: 'c', kind: 'type', element: field, text: '8', inputName: 42 },
        { id: 'd', kind: 'type', element: field, text: '8', inputName: 'x'.repeat(41) }
      ]
    }))
    const read = await readSidecar(project, 'flows/a_flow.rb')
    expect(read?.steps).toEqual([
      good,
      { id: 'b', kind: 'type', element: field, text: '8' },
      { id: 'c', kind: 'type', element: field, text: '8' },
      { id: 'd', kind: 'type', element: field, text: '8' }
    ])
  })

  it('drops the input name of a secret step: a secret never becomes an input', async () => {
    await writeSidecar(project, sidecar('flows/a_flow.rb', { kind: 'flow' }))
    const secret = {
      id: 'p',
      kind: 'type',
      element: field,
      text: '',
      secret: true,
      secretName: 'RAIDER_SECRET_1'
    }
    await rewrite('flows/a_flow.rb', (raw) => ({
      ...raw,
      steps: [{ ...secret, inputName: 'password' }]
    }))
    expect((await readSidecar(project, 'flows/a_flow.rb'))?.steps).toEqual([secret])
  })
})

describe('isStep inputName', () => {
  const field = { strategy: 'id' as const, value: 'hours' }
  const typed = (over: object): Record<string, unknown> => ({
    id: 's',
    kind: 'type',
    element: field,
    text: '8',
    ...over
  })

  it('accepts a valid input name', () => {
    expect(isStep(typed({ inputName: 'hours' }))).toBe(true)
    expect(isStep(typed({ inputName: 'a' + 'b'.repeat(39) }))).toBe(true)
    expect(isStep(typed({ inputName: 'week_2' }))).toBe(true)
  })

  it('rejects a name that fails the rule', () => {
    for (const inputName of ['', 'Hours', '1st', '_x', 'a-b', 'a'.repeat(41), 3]) {
      expect(isStep(typed({ inputName }))).toBe(false)
    }
  })

  it('rejects an input name together with secret', () => {
    expect(
      isStep(
        typed({ text: '', secret: true, secretName: 'RAIDER_SECRET_1', inputName: 'password' })
      )
    ).toBe(false)
  })
})
