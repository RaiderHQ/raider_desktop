import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import { mkdtemp, readFile, writeFile, rm, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  backupSuitesFile,
  loadSuiteIndex,
  readSuitesFile,
  saveSuiteIndex,
  LegacySuitesFileError,
  UnknownSuitesVersionError
} from '../../src/main/handlers/suitePersistence'
import type { Suite } from '../../src/shared/types/suite'

// What is left of suitePersistence after suites were retired: the backup and the
// version 3 index reader, which the suites-to-tags migration still needs.

let a: string
const suite = (name: string): Suite => ({ id: `id-${name}`, name, tests: [] })
const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

beforeEach(async () => {
  a = await mkdtemp(join(tmpdir(), 'suites-a-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(a, { recursive: true, force: true })
})

describe('backupSuitesFile', () => {
  it('copies suites.json to a timestamped .bak', async () => {
    await saveSuiteIndex(a, [{ id: 's1', name: 'keep', testIds: [] }])
    const backup = await backupSuitesFile(a)
    expect(backup).toMatch(/suites\.json\.[0-9TZ-]+\.bak$/)
    expect(JSON.parse(await readFile(backup!, 'utf-8')).suites).toEqual([
      { id: 's1', name: 'keep', testIds: [] }
    ])
  })

  it('is a no-op when there is no suites file', async () => {
    expect(await backupSuitesFile(a)).toBeNull()
  })
})

describe('suite index (version 3)', () => {
  const index = [{ id: 's1', name: 'Smoke', testIds: ['t1', 't2'] }]
  const write = async (body: string): Promise<void> => {
    await fsp.mkdir(join(a, '.raider'), { recursive: true })
    await writeFile(join(a, '.raider', 'suites.json'), body)
  }

  it('round trips and writes version 3', async () => {
    await saveSuiteIndex(a, index)
    const written = JSON.parse(await readFile(join(a, '.raider', 'suites.json'), 'utf-8'))
    expect(written).toEqual({ version: 3, suites: index })
    expect(await loadSuiteIndex(a)).toEqual({ suites: index, recoveredFromCorrupt: false })
  })

  it('returns an empty index when there is no file', async () => {
    expect(await loadSuiteIndex(a)).toEqual({ suites: [], recoveredFromCorrupt: false })
  })

  it('corrupt version 3 index recovered', async () => {
    await write(JSON.stringify({ version: 3, suites: [{ id: 's1', name: 'x', testIds: [1] }] }))
    expect(await loadSuiteIndex(a)).toEqual({
      suites: [],
      recoveredFromCorrupt: true,
      backupSaved: true
    })
    const [backup] = (await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))
    expect(backup).toMatch(/^suites\.json\.[0-9TZ-]+\.bak$/)
    expect(await exists(join(a, '.raider', 'suites.json'))).toBe(false)
  })

  it('unparsable index recovered, best-effort when it cannot be moved', async () => {
    await write('{not json')
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('EACCES'))
    expect(await loadSuiteIndex(a)).toEqual({
      suites: [],
      recoveredFromCorrupt: true,
      backupSaved: false
    })
  })

  it('a version 2 file is never treated as a corrupt index', async () => {
    const v2 = JSON.stringify({ version: 2, suites: [suite('s')] })
    await write(v2)
    await expect(loadSuiteIndex(a)).rejects.toBeInstanceOf(LegacySuitesFileError)
    expect(await readFile(join(a, '.raider', 'suites.json'), 'utf-8')).toBe(v2)
    expect((await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))).toEqual([])
  })

  it('a newer version file is neither migrated nor treated as corrupt', async () => {
    const v4 = JSON.stringify({ version: 4, suites: [{ id: 's', name: 's', testIds: [] }] })
    await write(v4)
    await expect(loadSuiteIndex(a)).rejects.toBeInstanceOf(UnknownSuitesVersionError)
    expect(await readFile(join(a, '.raider', 'suites.json'), 'utf-8')).toBe(v4)
    expect((await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))).toEqual([])
  })

  it('quick consecutive index writes end with the last one', async () => {
    await Promise.all([
      saveSuiteIndex(a, [{ id: 'x', name: 'x', testIds: [] }]),
      saveSuiteIndex(a, index)
    ])
    expect((await loadSuiteIndex(a)).suites).toEqual(index)
  })

  it('readSuitesFile classifies the file without changing it', async () => {
    expect(await readSuitesFile(a)).toEqual({ kind: 'missing' })
    await write(JSON.stringify({ version: 2, suites: [suite('s')] }))
    expect(await readSuitesFile(a)).toMatchObject({ kind: 'legacy', version: 2 })
    await write(JSON.stringify({ version: 3, suites: index }))
    expect(await readSuitesFile(a)).toEqual({ kind: 'index', suites: index })
    await write(JSON.stringify({ version: 7, suites: [] }))
    expect(await readSuitesFile(a)).toEqual({ kind: 'unknown', version: 7 })
    await write('{not json')
    expect(await readSuitesFile(a)).toEqual({ kind: 'corrupt' })
  })
})
