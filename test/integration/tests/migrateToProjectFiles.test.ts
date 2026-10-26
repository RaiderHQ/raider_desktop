import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import * as recorded from '../../../src/main/handlers/tests/recordedTests'
import {
  migrateToProjectFiles,
  MigrationPostponedError
} from '../../../src/main/handlers/tests/migrateToProjectFiles'
import * as sidecarModule from '../../../src/main/handlers/tests/sidecar'
import { listSidecars } from '../../../src/main/handlers/tests/sidecar'
import { saveSuiteIndex, saveSuites } from '../../../src/main/handlers/suitePersistence'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Test } from '../../../src/shared/types/test'

let project: string

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const test = (id: string, name: string): Test => ({
  id,
  name,
  url: 'https://x.test',
  steps: [{ id: `${id}-s`, kind: 'navigate', url: `https://x.test/${id}` }]
})

const v2 = {
  version: 2,
  suites: [
    { id: 's1', name: 'Smoke', tests: [test('t1', 'Login'), test('t2', 'Logout')] },
    { id: 's2', name: 'Cart', tests: [test('t3', 'Checkout')] }
  ]
}

const suitesPath = (): string => join(project, '.raider', 'suites.json')
const writeSuites = async (body: unknown): Promise<string> => {
  const raw = JSON.stringify(body)
  await mkdir(join(project, '.raider'), { recursive: true })
  await writeFile(suitesPath(), raw)
  return raw
}
const specs = async (): Promise<string[]> =>
  (await readdir(join(project, 'spec')).catch(() => [] as string[])).sort()
const backups = async (): Promise<string[]> =>
  (await readdir(join(project, '.raider'))).filter((f) => f.endsWith('.bak'))
const readJson = async (p: string): Promise<unknown> => JSON.parse(await readFile(p, 'utf-8'))

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-migrate-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
})

describe('migrateToProjectFiles', () => {
  it('migration writes files and index', async () => {
    const raw = await writeSuites(v2)
    const result = await migrateToProjectFiles(project, layout)

    expect(result).toEqual({ migrated: 3, backup: expect.any(String) })
    expect(await specs()).toEqual(['checkout_spec.rb', 'login_spec.rb', 'logout_spec.rb'])
    const sidecars = await listSidecars(project)
    expect(sidecars.map((s) => s.sidecar?.id).sort()).toEqual(['t1', 't2', 't3'])
    expect(sidecars.find((s) => s.sidecar?.id === 't1')?.sidecar?.steps).toEqual(
      v2.suites[0].tests[0].steps
    )
    expect(await readJson(suitesPath())).toEqual({
      version: 3,
      suites: [
        { id: 's1', name: 'Smoke', testIds: ['t1', 't2'] },
        { id: 's2', name: 'Cart', testIds: ['t3'] }
      ]
    })
    expect(await backups()).toHaveLength(1)
    expect(await readFile(result.backup!, 'utf-8')).toBe(raw)
  })

  it('migration never overwrites an existing spec', async () => {
    await mkdir(join(project, 'spec'), { recursive: true })
    await writeFile(join(project, 'spec', 'login_spec.rb'), '# hand written\n')
    await writeSuites(v2)
    await migrateToProjectFiles(project, layout)

    expect(await readFile(join(project, 'spec', 'login_spec.rb'), 'utf-8')).toBe('# hand written\n')
    expect(await specs()).toEqual([
      'checkout_spec.rb',
      'login_2_spec.rb',
      'login_spec.rb',
      'logout_spec.rb'
    ])
    expect((await recorded.findSidecarById(project, 't1'))?.file).toBe('spec/login_2_spec.rb')
  })

  it('migration is idempotent', async () => {
    await writeSuites(v2)
    await migrateToProjectFiles(project, layout)
    // A crash before the index write leaves the version 2 file in place
    await writeSuites(v2)
    const again = await migrateToProjectFiles(project, layout)

    expect(again).toMatchObject({ migrated: 3 })
    expect(await specs()).toEqual(['checkout_spec.rb', 'login_spec.rb', 'logout_spec.rb'])
    expect(await listSidecars(project)).toHaveLength(3)
    expect(((await readJson(suitesPath())) as { version: number }).version).toBe(3)
  })

  it('does nothing for a version 3 index', async () => {
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t1'] }])
    const before = await readFile(suitesPath(), 'utf-8')
    expect(await migrateToProjectFiles(project, layout)).toEqual({ migrated: 0, backup: null })
    expect(await readFile(suitesPath(), 'utf-8')).toBe(before)
    expect(await backups()).toEqual([])
  })

  it('does nothing without a suites file', async () => {
    expect(await migrateToProjectFiles(project, layout)).toEqual({ migrated: 0, backup: null })
    expect(await specs()).toEqual([])
  })

  it('leaves a corrupt suites file for the loader to recover', async () => {
    await mkdir(join(project, '.raider'), { recursive: true })
    await writeFile(suitesPath(), '{not json')
    expect(await migrateToProjectFiles(project, layout)).toMatchObject({ migrated: 0 })
    expect(await readFile(suitesPath(), 'utf-8')).toBe('{not json')
  })

  it('cucumber project keeps version 2', async () => {
    const raw = await writeSuites(v2)
    const result = await migrateToProjectFiles(project, { ...layout, framework: 'cucumber' })
    expect(result).toEqual({ migrated: 0, backup: null })
    expect(await readFile(suitesPath(), 'utf-8')).toBe(raw)
    expect(await specs()).toEqual([])
    expect(await backups()).toEqual([])
  })

  it('a non-recordable project keeps version 2', async () => {
    const raw = await writeSuites(v2)
    await migrateToProjectFiles(project, { ...layout, recordable: false })
    expect(await readFile(suitesPath(), 'utf-8')).toBe(raw)
  })

  it('a save error postpones the whole migration: no index, version 2 kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = recorded.saveRecordedTest
    vi.spyOn(recorded, 'saveRecordedTest').mockImplementation((p, l, t, o) =>
      t.id === 't2' ? Promise.reject(new Error('disk full')) : real(p, l, t, o)
    )
    const raw = await writeSuites(v2)
    await expect(migrateToProjectFiles(project, layout)).rejects.toBeInstanceOf(
      MigrationPostponedError
    )
    expect(await readFile(suitesPath(), 'utf-8')).toBe(raw)
    expect(await backups()).toHaveLength(1)
  })

  it('a re-run after a postponed migration picks up edits made in the meantime', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = recorded.saveRecordedTest
    const spy = vi
      .spyOn(recorded, 'saveRecordedTest')
      .mockImplementation((p, l, t, o) =>
        t.id === 't2' ? Promise.reject(new Error('disk full')) : real(p, l, t, o)
      )
    await writeSuites(v2)
    await expect(migrateToProjectFiles(project, layout)).rejects.toThrow()
    expect((await recorded.findSidecarById(project, 't1'))?.steps).toEqual(
      v2.suites[0].tests[0].steps
    )

    // The app keeps running on version 2 and the user edits t1
    const editedSteps = [{ id: 'e', kind: 'navigate', url: 'https://edited.test' }]
    const edited = structuredClone(v2)
    edited.suites[0].tests[0].steps = editedSteps
    await writeSuites(edited)
    spy.mockRestore()

    expect(await migrateToProjectFiles(project, layout)).toMatchObject({ migrated: 3 })
    expect((await recorded.findSidecarById(project, 't1'))?.steps).toEqual(editedSteps)
    expect(await readFile(join(project, 'spec', 'login_spec.rb'), 'utf-8')).toContain(
      'https://edited.test'
    )
    expect(await specs()).toEqual(['checkout_spec.rb', 'login_spec.rb', 'logout_spec.rb'])
  })

  it('a re-run keeps a spec the user edited in code and counts it as migrated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = recorded.saveRecordedTest
    const spy = vi
      .spyOn(recorded, 'saveRecordedTest')
      .mockImplementation((p, l, t, o) =>
        t.id === 't2' ? Promise.reject(new Error('disk full')) : real(p, l, t, o)
      )
    await writeSuites(v2)
    await expect(migrateToProjectFiles(project, layout)).rejects.toThrow()
    spy.mockRestore()
    const login = join(project, 'spec', 'login_spec.rb')
    await writeFile(login, (await readFile(login, 'utf-8')) + '\nputs "mine"\n')
    const mine = await readFile(login, 'utf-8')

    expect(await migrateToProjectFiles(project, layout)).toMatchObject({ migrated: 3 })
    expect(await readFile(login, 'utf-8')).toBe(mine)
    expect(((await readJson(suitesPath())) as { version: number }).version).toBe(3)
  })

  it('a suites file changed during migration is never overwritten by the index', async () => {
    const real = recorded.saveRecordedTest
    const changed = { version: 2, suites: [...v2.suites, { id: 's3', name: 'New', tests: [] }] }
    vi.spyOn(recorded, 'saveRecordedTest').mockImplementation(async (p, l, t, o) => {
      if (t.id === 't3') await saveSuites(project, changed.suites)
      return real(p, l, t, o)
    })
    await writeSuites(v2)
    await expect(migrateToProjectFiles(project, layout)).rejects.toBeInstanceOf(
      MigrationPostponedError
    )
    expect(await readJson(suitesPath())).toEqual(changed)
  })

  it('a version 4 file is left alone', async () => {
    const raw = await writeSuites({ ...v2, version: 4 })
    expect(await migrateToProjectFiles(project, layout)).toEqual({ migrated: 0, backup: null })
    expect(await readFile(suitesPath(), 'utf-8')).toBe(raw)
    expect(await backups()).toEqual([])
  })

  it('reads the recorded tests folder once, not once per test', async () => {
    await writeSuites(v2)
    const scans = vi.spyOn(sidecarModule, 'listSidecars')
    await migrateToProjectFiles(project, layout)
    expect(scans).toHaveBeenCalledTimes(1)
  })

  it('an unreadable step becomes a one-line comment instead of losing the test', async () => {
    const bad = { id: 'b', kind: 'bogus', note: 'a\nb\r\nc\u2028d\u2029e\u0085f' }
    await writeSuites({
      version: 2,
      suites: [
        {
          id: 's1',
          name: 'Smoke',
          tests: [{ ...test('t1', 'Login'), steps: [test('t1', 'Login').steps[0], bad] }]
        }
      ]
    })
    expect(await migrateToProjectFiles(project, layout)).toMatchObject({ migrated: 1 })
    const steps = (await recorded.findSidecarById(project, 't1'))!.steps
    expect(steps[0]).toEqual(test('t1', 'Login').steps[0])
    expect(steps[1]).toMatchObject({ id: 'b', kind: 'custom' })
    const code = (steps[1] as { code: string }).code
    expect(code.startsWith('# Could not read this step: ')).toBe(true)
    expect(code).not.toMatch(/[\n\r\u0085\u2028\u2029]/)
    expect(JSON.parse(code.slice('# Could not read this step: '.length))).toEqual(bad)
    const spec = await readFile(join(project, 'spec', 'login_spec.rb'), 'utf-8')
    expect(spec.split('\n').some((line) => line.trim() === code)).toBe(true)
  })

  it('a test without an id gets one that stays the same on a re-run', async () => {
    const noId = { suites: [{ id: 's1', name: 'Smoke', tests: [{ ...test('', 'Login') }] }] }
    await writeSuites({ version: 2, ...noId })
    await migrateToProjectFiles(project, layout)
    const first = (await readJson(suitesPath())) as { suites: { testIds: string[] }[] }
    const [id] = first.suites[0].testIds
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await recorded.findSidecarById(project, id))?.name).toBe('Login')

    // Interrupted before the index: the same id is found again, no second file
    await writeSuites({ version: 2, ...noId })
    await migrateToProjectFiles(project, layout)
    const second = (await readJson(suitesPath())) as { suites: { testIds: string[] }[] }
    expect(second.suites[0].testIds).toEqual([id])
    expect(await specs()).toEqual(['login_spec.rb'])
  })

  it('writes no index when the backup fails', async () => {
    const raw = await writeSuites(v2)
    const persistence = await import('../../../src/main/handlers/suitePersistence')
    vi.spyOn(persistence, 'backupSuitesFile').mockRejectedValueOnce(new Error('EACCES'))
    await expect(migrateToProjectFiles(project, layout)).rejects.toThrow('EACCES')
    expect(await readFile(suitesPath(), 'utf-8')).toBe(raw)
    expect(await specs()).toEqual([])
  })

  it('migrates a version 1 file, converting Ruby steps first', async () => {
    const raw = await writeSuites({
      version: 1,
      suites: [
        {
          id: 's1',
          name: 'Smoke',
          tests: [{ id: 't1', name: 'Login', url: '', steps: ['@driver.get("https://x.test")'] }]
        }
      ]
    })
    const result = await migrateToProjectFiles(project, layout)

    expect(result).toMatchObject({ migrated: 1 })
    expect((await recorded.findSidecarById(project, 't1'))?.steps).toEqual([
      { id: expect.any(String), kind: 'navigate', url: 'https://x.test' }
    ])
    expect(await readFile(result.backup!, 'utf-8')).toBe(raw)
    expect(await readJson(suitesPath())).toEqual({
      version: 3,
      suites: [{ id: 's1', name: 'Smoke', testIds: ['t1'] }]
    })
  })

  it('a test id shared by two suites is saved once and listed in both', async () => {
    await writeSuites({
      version: 2,
      suites: [
        { id: 's1', name: 'A', tests: [test('t1', 'Login')] },
        { id: 's2', name: 'B', tests: [test('t1', 'Login')] }
      ]
    })
    const result = await migrateToProjectFiles(project, layout)
    expect(result).toMatchObject({ migrated: 1 })
    expect(await specs()).toEqual(['login_spec.rb'])
    const index = (await readJson(suitesPath())) as { suites: { testIds: string[] }[] }
    expect(index.suites.map((s) => s.testIds)).toEqual([['t1'], ['t1']])
  })

  it('a different test reusing an id is saved under a new id', async () => {
    const edited = {
      ...test('t1', 'Login'),
      steps: [{ id: 'x', kind: 'navigate', url: 'https://y.test' }]
    }
    await writeSuites({
      version: 2,
      suites: [
        { id: 's1', name: 'A', tests: [test('t1', 'Login')] },
        { id: 's2', name: 'B', tests: [edited] }
      ]
    })
    expect(await migrateToProjectFiles(project, layout)).toMatchObject({ migrated: 2 })
    const index = (await readJson(suitesPath())) as { suites: { testIds: string[] }[] }
    expect(index.suites[0].testIds).toEqual(['t1'])
    const [newId] = index.suites[1].testIds
    expect(newId).not.toBe('t1')
    expect((await recorded.findSidecarById(project, newId))?.steps).toEqual(edited.steps)
    expect((await recorded.findSidecarById(project, 't1'))?.steps).toEqual(
      test('t1', 'Login').steps
    )
  })
})
