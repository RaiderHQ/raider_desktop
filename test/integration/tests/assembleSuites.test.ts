import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { assembleSuites } from '../../../src/main/handlers/tests/assembleSuites'
import { saveRecordedTest, findSidecarById } from '../../../src/main/handlers/tests/recordedTests'
import { writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import {
  saveSuiteIndex,
  saveSuites,
  LegacySuitesFileError
} from '../../../src/main/handlers/suitePersistence'
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

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-assemble-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
})

describe('assembleSuites', () => {
  it('builds suites from the index and sidecars, in index order', async () => {
    await saveRecordedTest(project, layout, test('t1', 'Login'))
    await saveRecordedTest(project, layout, test('t2', 'Logout'))
    await saveSuiteIndex(project, [
      { id: 's1', name: 'Smoke', testIds: ['t2', 't1'] },
      { id: 's2', name: 'Empty', testIds: [] }
    ])

    expect(await assembleSuites(project)).toEqual([
      {
        id: 's1',
        name: 'Smoke',
        tests: [
          { ...test('t2', 'Logout'), file: 'spec/logout_spec.rb', ownership: 'recorded' },
          { ...test('t1', 'Login'), file: 'spec/login_spec.rb', ownership: 'recorded' }
        ]
      },
      { id: 's2', name: 'Empty', tests: [] }
    ])
  })

  it('marks a test whose file was edited in code', async () => {
    const sidecar = await saveRecordedTest(project, layout, test('t1', 'Login'))
    const file = join(project, sidecar.file)
    await writeFile(file, (await readFile(file, 'utf-8')) + '\nputs "edited"\n')
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t1'] }])

    const [suite] = await assembleSuites(project)
    expect(suite.tests[0].ownership).toBe('codeOwnedWasRecorded')
    expect((await findSidecarById(project, 't1'))?.codeOwned).toBe(true)
  })

  it('keeps a test marked code-owned even if its file is gone', async () => {
    const sidecar = await saveRecordedTest(project, layout, test('t1', 'Login'))
    await writeSidecar(project, { ...sidecar, codeOwned: true })
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t1'] }])
    expect((await assembleSuites(project))[0].tests[0].ownership).toBe('codeOwnedWasRecorded')
  })

  it('a missing file still counts as recorded (saving restores it)', async () => {
    const sidecar = await saveRecordedTest(project, layout, test('t1', 'Login'))
    await unlink(join(project, sidecar.file))
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t1'] }])
    expect((await assembleSuites(project))[0].tests[0].ownership).toBe('recorded')
  })

  it('omits an indexed id without a sidecar but keeps it in the index', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await saveRecordedTest(project, layout, test('t1', 'Login'))
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t1', 'gone'] }])

    const [suite] = await assembleSuites(project)
    expect(suite.tests.map((t) => t.id)).toEqual(['t1'])
    expect(error).toHaveBeenCalled()
    const index = JSON.parse(await readFile(join(project, '.raider', 'suites.json'), 'utf-8'))
    expect(index.suites[0].testIds).toEqual(['t1', 'gone'])
  })

  it('ignores a sidecar stored somewhere other than its file says', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sidecar = await saveRecordedTest(project, layout, test('t1', 'Login'))
    await mkdir(join(project, '.raider', 'tests', 'spec'), { recursive: true })
    await writeFile(
      join(project, '.raider', 'tests', 'spec', 'other_spec.rb.json'),
      JSON.stringify({ ...sidecar, id: 't9' })
    )
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t9'] }])
    expect((await assembleSuites(project))[0].tests).toEqual([])
  })

  it('returns no suites without a suites file', async () => {
    expect(await assembleSuites(project)).toEqual([])
  })

  it('refuses a version 2 file instead of showing it empty', async () => {
    await saveSuites(project, [{ id: 's1', name: 'Smoke', tests: [test('t1', 'Login')] }])
    await expect(assembleSuites(project)).rejects.toBeInstanceOf(LegacySuitesFileError)
  })
})
