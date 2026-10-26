import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { listProjectTests } from '../../../src/main/handlers/tests/listProjectTests'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar } from '../../../src/main/handlers/tests/sidecar'
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

const rec = (id: string, name: string): Test => ({
  id,
  name,
  url: 'https://x.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://x.test/1' }]
})

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-list-'))
  await mkdir(join(project, 'spec'), { recursive: true })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
})

describe('listProjectTests', () => {
  it('recorded, code-owned and code', async () => {
    await saveRecordedTest(project, layout, rec('a', 'Alpha'))
    const b = await saveRecordedTest(project, layout, rec('b', 'Bravo'))
    await saveRecordedTest(project, layout, rec('c', 'Charlie'))
    await writeFile(
      join(project, b.file),
      (await readFile(join(project, b.file), 'utf-8')) + '\n# x\nputs 1\n'
    )
    await writeFile(join(project, 'spec/hand_spec.rb'), "describe 'Hand' do\nend\n")
    const list = await listProjectTests(project, layout)
    const by = Object.fromEntries(list.map((e) => [e.name, e]))
    expect(by.Alpha.ownership).toBe('recorded')
    expect(by.Alpha.testId).toBe('a')
    expect(by.Bravo.ownership).toBe('codeOwnedWasRecorded')
    expect(by.Hand.ownership).toBe('code')
    expect(by.Hand.testId).toBeUndefined()
    expect(list.map((e) => e.name)).toEqual([...list.map((e) => e.name)].sort())
  })

  it('mismatch persists codeOwned', async () => {
    const s = await saveRecordedTest(project, layout, rec('a', 'Alpha'))
    const original = await readFile(join(project, s.file), 'utf-8')
    await writeFile(join(project, s.file), original + 'puts 1\n')
    await listProjectTests(project, layout)
    expect((await readSidecar(project, s.file))?.codeOwned).toBe(true)
    await writeFile(join(project, s.file), original)
    const list = await listProjectTests(project, layout)
    expect(list[0].ownership).toBe('codeOwnedWasRecorded')
  })

  it('a matching hash without the marker is not recorded', async () => {
    const s = await saveRecordedTest(project, layout, rec('a', 'Alpha'))
    const original = await readFile(join(project, s.file), 'utf-8')
    const stripped = original
      .split('\n')
      .filter((l) => !l.includes('Recorded with Raider'))
      .join('\n')
    await writeFile(join(project, s.file), stripped)
    const list = await listProjectTests(project, layout)
    expect(stripped).not.toBe(original)
    expect(list[0].ownership).toBe('codeOwnedWasRecorded')
  })

  it('unreadable sidecar is code-owned', async () => {
    await writeFile(join(project, 'spec/x_spec.rb'), "describe 'X' do\nend\n")
    await mkdir(join(project, '.raider/tests/spec'), { recursive: true })
    await writeFile(join(project, '.raider/tests/spec/x_spec.rb.json'), '{nope')
    const list = await listProjectTests(project, layout)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ file: 'spec/x_spec.rb', ownership: 'code', name: 'X' })
    expect(await readFile(join(project, 'spec/x_spec.rb'), 'utf-8')).toBe("describe 'X' do\nend\n")
  })

  it('missing file flagged', async () => {
    const s = await saveRecordedTest(project, layout, rec('a', 'Alpha'))
    await unlink(join(project, s.file))
    const list = await listProjectTests(project, layout)
    expect(list).toEqual([
      { file: s.file, name: 'Alpha', ownership: 'recorded', testId: 'a', missingFile: true }
    ])
  })

  it('lists a recorded file outside the current spec path', async () => {
    const s = await saveRecordedTest(project, layout, rec('a', 'Alpha'))
    const list = await listProjectTests(project, { ...layout, specPath: 'other' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ file: s.file, ownership: 'recorded' })
  })

  it('skips symlinked specs and does not throw', async () => {
    await writeFile(join(project, 'real.txt'), 'x')
    await symlink(join(project, 'real.txt'), join(project, 'spec/link_spec.rb'))
    expect(await listProjectTests(project, layout)).toEqual([])
  })

  it('treats a .raider/tests that escapes the project as no sidecars', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'raider-out-'))
    await mkdir(join(project, '.raider'), { recursive: true })
    await symlink(outside, join(project, '.raider/tests'))
    await writeFile(join(project, 'spec/h_spec.rb'), "describe 'H' do\nend\n")
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const list = await listProjectTests(project, layout)
    expect(list).toEqual([{ file: 'spec/h_spec.rb', name: 'H', ownership: 'code' }])
    await rm(outside, { recursive: true, force: true })
  })

  it('cucumber layout lists nothing', async () => {
    await writeFile(join(project, 'spec/h_spec.rb'), "describe 'H' do\nend\n")
    expect(await listProjectTests(project, { ...layout, framework: 'cucumber' })).toEqual([])
  })
})
