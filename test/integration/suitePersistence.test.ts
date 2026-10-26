import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))
const mockUserData = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: mockDialog,
  app: { getPath: (): string => mockUserData.dir }
}))

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import createSuite from '../../src/main/handlers/createSuite'
import deleteSuite from '../../src/main/handlers/deleteSuite'
import deleteTest from '../../src/main/handlers/deleteTest'
import saveTrace from '../../src/main/handlers/trace/saveTrace'
import importProject from '../../src/main/handlers/io/importProject'
import importSuite from '../../src/main/handlers/io/importSuite'
import importTest from '../../src/main/handlers/io/importTest'
import saveRecording from '../../src/main/handlers/recording/saveRecording'
import getSuites from '../../src/main/handlers/getSuites'
import * as persistence from '../../src/main/handlers/suitePersistence'
import {
  loadSuites,
  saveSuites,
  loadSuiteIndex,
  saveSuiteIndex,
  LegacySuitesFileError,
  UnknownSuitesVersionError
} from '../../src/main/handlers/suitePersistence'
import type { Suite } from '../../src/shared/types/suite'

let a: string
let b: string
const suite = (name: string): Suite => ({ id: `id-${name}`, name, tests: [] })
const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )
const send = vi.fn()
const win = { webContents: { send } } as never

beforeEach(async () => {
  a = await mkdtemp(join(tmpdir(), 'suites-a-'))
  b = await mkdtemp(join(tmpdir(), 'suites-b-'))
  appState.projectPath = null
  appState.suites = new Map()
  appState.mainWindow = null
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  send.mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(a, { recursive: true, force: true })
  await rm(b, { recursive: true, force: true })
})

describe('suite files', () => {
  it('round trips, creating .raider/', async () => {
    const suites: Suite[] = [
      {
        ...suite('s'),
        tests: [{ id: 't', name: 'T', url: '', steps: [{ id: 'n', kind: 'navigate', url: 'u' }] }]
      }
    ]
    await saveSuites(a, suites)
    expect(await loadSuites(a)).toEqual({ suites, recoveredFromCorrupt: false })
  })

  it('writes version 2', async () => {
    await saveSuites(a, [suite('s')])
    const written = JSON.parse(await readFile(join(a, '.raider', 'suites.json'), 'utf-8'))
    expect(written.version).toBe(2)
  })

  it('migrates a version 1 file to steps and rewrites it as version 2', async () => {
    const legacy = {
      version: 1,
      suites: [
        {
          ...suite('s'),
          tests: [
            {
              id: 't',
              name: 'T',
              url: '',
              steps: ['@driver.get("https://x.test")', 'puts "hi"']
            }
          ]
        }
      ]
    }
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), JSON.stringify(legacy))

    const { suites } = await loadSuites(a)
    expect(suites[0].tests[0].steps).toEqual([
      { id: expect.any(String), kind: 'navigate', url: 'https://x.test' },
      { id: expect.any(String), kind: 'custom', code: 'puts "hi"' }
    ])

    const written = JSON.parse(await readFile(join(a, '.raider', 'suites.json'), 'utf-8'))
    expect(written.version).toBe(2)
    expect(written.suites).toEqual(suites)
  })

  it('backs up the version 1 file before rewriting it', async () => {
    const legacy = JSON.stringify({ version: 1, suites: [suite('s')] })
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), legacy)
    await loadSuites(a)
    expect(await readFile(join(a, '.raider', 'suites.json.v1.bak'), 'utf-8')).toBe(legacy)
  })

  it('still loads migrated suites when the rewrite and backup fail', async () => {
    const legacy = {
      version: 1,
      suites: [{ ...suite('s'), tests: [{ id: 't', name: 'T', url: '', steps: ['puts 1'] }] }]
    }
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), JSON.stringify(legacy))
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    vi.spyOn(fsp, 'writeFile').mockRejectedValue(eacces)
    vi.spyOn(fsp, 'copyFile').mockRejectedValue(eacces)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { suites, recoveredFromCorrupt } = await loadSuites(a)
    expect(recoveredFromCorrupt).toBe(false)
    expect(suites[0].tests[0].steps).toEqual([
      { id: expect.any(String), kind: 'custom', code: 'puts 1' }
    ])
  })

  it('does not rewrite a version 2 file on load', async () => {
    await saveSuites(a, [suite('s')])
    const spy = vi.spyOn(fsp, 'writeFile')
    await loadSuites(a)
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns empty when there is no file', async () => {
    expect(await loadSuites(a)).toEqual({ suites: [], recoveredFromCorrupt: false })
  })

  it('loads a plain array of suites', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), JSON.stringify([suite('x')]))
    expect((await loadSuites(a)).suites).toEqual([suite('x')])
  })

  it('is atomic: a failed rename leaves no suites.json', async () => {
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('boom'))
    await expect(saveSuites(a, [suite('x')])).rejects.toThrow('boom')
    expect(await exists(join(a, '.raider', 'suites.json'))).toBe(false)
  })

  it('a failed write does not block later writes', async () => {
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('boom'))
    await expect(saveSuites(a, [suite('x')])).rejects.toThrow()
    await saveSuites(a, [suite('y')])
    expect((await loadSuites(a)).suites).toEqual([suite('y')])
  })

  it('quick consecutive saves end with the last one', async () => {
    await Promise.all([
      saveSuites(a, [suite('1')]),
      saveSuites(a, [suite('2')]),
      saveSuites(a, [suite('3')])
    ])
    expect((await loadSuites(a)).suites).toEqual([suite('3')])
  })

  it('corrupt file is moved to a timestamped suites.json.<time>.bak', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), '{not json')
    expect(await loadSuites(a)).toEqual({
      suites: [],
      recoveredFromCorrupt: true,
      backupSaved: true
    })
    const [backup] = (await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))
    expect(backup).toMatch(/^suites\.json\.[0-9TZ-]+\.bak$/)
    expect(await readFile(join(a, '.raider', backup), 'utf-8')).toBe('{not json')
    expect(await exists(join(a, '.raider', 'suites.json'))).toBe(false)
  })

  it('a second corruption keeps the earlier backup', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), 'first')
    await loadSuites(a)
    await writeFile(join(a, '.raider', 'suites.json'), 'second')
    await loadSuites(a)
    const backups = (await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))
    const contents = await Promise.all(backups.map((f) => readFile(join(a, '.raider', f), 'utf-8')))
    expect(contents.sort()).toEqual(['first', 'second'])
  })

  it('a version 2 file with a suite missing its tests is treated as corrupt', async () => {
    await fsp.mkdir(join(a, '.raider'))
    const bad = JSON.stringify({ version: 2, suites: [{ id: 'x', name: 'x' }] })
    await writeFile(join(a, '.raider', 'suites.json'), bad)
    expect(await loadSuites(a)).toMatchObject({ suites: [], recoveredFromCorrupt: true })
    const backups = (await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))
    expect(backups).toHaveLength(1)
  })

  it('a version 2 file with a test missing its steps is treated as corrupt', async () => {
    await fsp.mkdir(join(a, '.raider'))
    const bad = JSON.stringify({
      version: 2,
      suites: [{ id: 'x', name: 'x', tests: [{ id: 't', name: 't', url: '' }] }]
    })
    await writeFile(join(a, '.raider', 'suites.json'), bad)
    expect((await loadSuites(a)).recoveredFromCorrupt).toBe(true)
  })

  it('opens with empty suites when the corrupt file cannot be moved aside', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), '{not json')
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('EACCES'))
    expect(await loadSuites(a)).toEqual({
      suites: [],
      recoveredFromCorrupt: true,
      backupSaved: false
    })
  })

  it('backupSuitesFile copies suites.json to a timestamped .bak', async () => {
    await saveSuites(a, [suite('keep')])
    const backup = await persistence.backupSuitesFile(a)
    expect(backup).toMatch(/suites\.json\.[0-9TZ-]+\.bak$/)
    expect(JSON.parse(await readFile(backup!, 'utf-8')).suites).toEqual([suite('keep')])
  })

  it('backupSuitesFile is a no-op when there is no suites file', async () => {
    expect(await persistence.backupSuitesFile(a)).toBeNull()
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

  it('index and version 2 writes share one queue', async () => {
    const v2 = saveSuites(a, [suite('old')])
    const v3 = saveSuiteIndex(a, index)
    await Promise.all([v2, v3])
    const written = JSON.parse(await readFile(join(a, '.raider', 'suites.json'), 'utf-8'))
    expect(written.version).toBe(3)
  })
})

describe('setActiveProject loading', () => {
  it('loads suites, replacing the previous ones, and sends suite-updated', async () => {
    await saveSuites(a, [suite('A')])
    appState.mainWindow = win
    appState.suites = new Map([['old', suite('old')]])
    await setActiveProject(a)
    expect(Array.from(appState.suites.values())).toEqual([suite('A')])
    expect(send).toHaveBeenCalledWith('suite-updated', [suite('A')])
    expect(send.mock.calls.map(([channel]) => channel)).not.toContain('suites-recovered')
  })

  it('sends suites-recovered for a corrupt file', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), 'nope')
    appState.mainWindow = win
    await setActiveProject(a)
    expect(appState.suites.size).toBe(0)
    expect(send).toHaveBeenCalledWith('suites-recovered', { backupSaved: true })
  })

  it('null clears suites', async () => {
    await saveSuites(a, [suite('A')])
    await setActiveProject(a)
    await setActiveProject(null)
    expect(appState.suites.size).toBe(0)
  })

  it('switching project saves to the new path only', async () => {
    await setActiveProject(a)
    await createSuite(null, 'A-suite')
    await setActiveProject(b)
    await createSuite(null, 'B-suite')
    expect((await loadSuites(a)).suites.map((s) => s.name)).toEqual(['A-suite'])
    expect((await loadSuites(b)).suites.map((s) => s.name)).toEqual(['B-suite'])
  })

  it('persistActiveSuites is a no-op without a project', async () => {
    await expect(persistence.persistActiveSuites()).resolves.toBeUndefined()
  })
})

describe('handlers persist', () => {
  it('createSuite, saveRecording, deleteTest and deleteSuite each call persistActiveSuites', async () => {
    const spy = vi.spyOn(persistence, 'persistActiveSuites').mockResolvedValue()
    const created = await createSuite(null, 'S')
    const id = created.suite!.id
    expect(spy).toHaveBeenCalledTimes(1)

    await saveRecording(win, id, { id: 't1', name: 'T', url: '', steps: [] } as never)
    expect(spy).toHaveBeenCalledTimes(2)

    await deleteTest(null, { suiteId: id, testId: 't1' })
    expect(spy).toHaveBeenCalledTimes(3)

    await deleteSuite(null, id)
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('saveTrace, importProject, importSuite and importTest persist too', async () => {
    const spy = vi.spyOn(persistence, 'persistActiveSuites').mockResolvedValue()
    mockUserData.dir = a
    appState.suites = new Map([
      ['s1', { ...suite('s1'), tests: [{ id: 't9', name: 'T', url: '', steps: [] }] }]
    ])
    await saveTrace('t9', [])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(appState.suites.get('s1')!.tests[0].hasTrace).toBe(true)

    await mkdir(join(b, 'imported-suite'))
    await writeFile(join(b, 'imported-suite', 'one_spec.rb'), '# Test: One\n')
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [b] })
    await importProject(win)
    expect(spy).toHaveBeenCalledTimes(2)

    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(b, 'other-suite')]
    })
    await mkdir(join(b, 'other-suite'))
    await importSuite(win)
    expect(spy).toHaveBeenCalledTimes(3)

    const id = Array.from(appState.suites.keys()).at(-1)!
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(b, 'imported-suite', 'one_spec.rb')]
    })
    const res = await importTest(win, id)
    expect(res.success).toBe(true)
    expect(spy).toHaveBeenCalledTimes(4)
  })
})

describe('importProject keeps a backup', () => {
  it('copies the open project suites.json aside before replacing it', async () => {
    await saveSuites(a, [suite('precious')])
    await setActiveProject(a)
    await mkdir(join(b, 'imported-suite'))
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [b] })
    const result = await importProject({ ...win, reload: vi.fn() } as never)
    expect(result.success).toBe(true)
    const backups = (await fsp.readdir(join(a, '.raider'))).filter((f) => f.endsWith('.bak'))
    expect(backups).toHaveLength(1)
    const saved = JSON.parse(await readFile(join(a, '.raider', backups[0]), 'utf-8'))
    expect(saved.suites).toEqual([suite('precious')])
    expect((await loadSuites(a)).suites.map((s) => s.name)).toEqual(['imported-suite'])
  })
})

describe('imports migrate recorded Ruby to steps', () => {
  const legacyFile = [
    '# Test: Legacy',
    'begin',
    '  @driver.get("https://x.test")',
    '  @driver.find_element(:id, "q").clear',
    '  @driver.find_element(:id, "q").send_keys("cats")',
    '  puts "Test \'Legacy\' passed successfully!"',
    ''
  ].join('\n')
  const expected = [
    { id: expect.any(String), kind: 'navigate', url: 'https://x.test' },
    { id: expect.any(String), kind: 'type', element: { strategy: 'id', value: 'q' }, text: 'cats' }
  ]

  beforeEach(() => {
    vi.spyOn(persistence, 'persistActiveSuites').mockResolvedValue()
  })

  it('importTest', async () => {
    appState.suites = new Map([['s1', suite('s1')]])
    await writeFile(join(b, 'legacy.rb'), legacyFile)
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(b, 'legacy.rb')]
    })
    const res = await importTest(win, 's1')
    expect(res.test!.steps).toEqual(expected)
    // The start URL comes from the first navigate step
    expect(res.test!.url).toBe('https://x.test')
  })

  it('importSuite', async () => {
    await mkdir(join(b, 'legacy-suite'))
    await writeFile(join(b, 'legacy-suite', 'legacy.rb'), legacyFile)
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(b, 'legacy-suite')]
    })
    const res = await importSuite(win)
    expect(res.suite!.tests[0].steps).toEqual(expected)
    expect(res.suite!.tests[0].url).toBe('https://x.test')
  })

  it('importProject', async () => {
    await mkdir(join(b, 'legacy-suite'))
    await writeFile(join(b, 'legacy-suite', 'legacy.rb'), legacyFile)
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [b] })
    await importProject(win)
    const imported = Array.from(appState.suites.values()).find((s) => s.name === 'legacy-suite')
    expect(imported!.tests[0].steps).toEqual(expected)
    expect(imported!.tests[0].url).toBe('https://x.test')
  })
})

describe('failed activation', () => {
  it('clears the active project so nothing is saved into the previous one', async () => {
    await saveSuites(a, [suite('A')])
    await setActiveProject(a)
    // A directory where the file should be makes reading it fail with EISDIR
    await mkdir(join(b, '.raider', 'suites.json'), { recursive: true })
    appState.mainWindow = win
    const result = await setActiveProject(b)
    expect(result.success).toBe(false)
    expect(appState.projectPath).toBeNull()
    expect(appState.suites.size).toBe(0)
    expect(appState.recorderSettings).toEqual(DEFAULT_RECORDER_SETTINGS)
    expect(send).toHaveBeenCalledWith('suite-updated', [])

    await createSuite(null, 'stray')
    await persistence.persistActiveSuites()
    expect((await loadSuites(a)).suites).toEqual([suite('A')])
  })
})

describe('getSuites', () => {
  it('waits for an in-flight activation before returning suites', async () => {
    mockUserData.dir = b
    await saveSuites(a, [suite('A')])
    void setActiveProject(a)
    expect(await getSuites()).toEqual([suite('A')])
  })
})
