import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))
const mockUserData = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: mockDialog,
  app: { getPath: (): string => mockUserData.dir }
}))
const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import { appState } from '../../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import createSuite from '../../../src/main/handlers/createSuite'
import deleteSuite from '../../../src/main/handlers/deleteSuite'
import deleteTest from '../../../src/main/handlers/deleteTest'
import saveRecording from '../../../src/main/handlers/recording/saveRecording'
import importTest from '../../../src/main/handlers/io/importTest'
import importSuite from '../../../src/main/handlers/io/importSuite'
import importProject from '../../../src/main/handlers/io/importProject'
import saveTrace from '../../../src/main/handlers/trace/saveTrace'
import getSuites from '../../../src/main/handlers/getSuites'
import * as migration from '../../../src/main/handlers/tests/migrateToProjectFiles'
import * as assembly from '../../../src/main/handlers/tests/assembleSuites'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import * as persistence from '../../../src/main/handlers/suitePersistence'
import * as sidecars from '../../../src/main/handlers/tests/sidecar'
import { saveSuites, saveSuiteIndex } from '../../../src/main/handlers/suitePersistence'
import type { Suite } from '../../../src/shared/types/suite'
import type { Test } from '../../../src/shared/types/test'

let project: string
let other: string
const send = vi.fn()
const win = { webContents: { send }, reload: vi.fn() } as never

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )
const readJson = async (p: string): Promise<{ version: number; suites: unknown[] }> =>
  JSON.parse(await readFile(p, 'utf-8'))
const suitesJson = (dir: string): string => join(dir, '.raider', 'suites.json')

const checkout = (id = 't-checkout'): Test => ({
  id,
  name: 'Checkout',
  url: 'https://shop.test',
  steps: [{ id: `${id}-s1`, kind: 'navigate', url: 'https://shop.test/cart' }]
})

const lastSuites = (): Suite[] => {
  const calls = send.mock.calls.filter(([channel]) => channel === 'suite-updated')
  return calls.at(-1)![1]
}

async function rspecProject(dir: string): Promise<void> {
  await writeFile(join(dir, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
}

async function newSuite(name = 'Smoke'): Promise<string> {
  const result = await createSuite(win, name)
  expect(result.success).toBe(true)
  return result.suite!.id
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-store-'))
  other = await mkdtemp(join(tmpdir(), 'raider-store-other-'))
  mockUserData.dir = other
  await rspecProject(project)
  appState.projectPath = null
  appState.suites = new Map()
  appState.mainWindow = win
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  send.mockClear()
  mockSafeExec.mockReset()
  mockSafeExec.mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
})

afterEach(async () => {
  await setActiveProject(null)
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
  await rm(other, { recursive: true, force: true })
})

describe('recorded tests as project files', () => {
  it('save writes project file and index', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()

    const result = await saveRecording(win, suiteId, checkout())

    // The saved test comes back with its file, so the page can say where it went
    expect(result).toEqual({
      success: true,
      test: expect.objectContaining({ id: 't-checkout', file: 'spec/checkout_spec.rb' })
    })
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(await exists(join(project, '.raider', 'tests', 'spec', 'checkout_spec.rb.json'))).toBe(
      true
    )
    expect(await readJson(suitesJson(project))).toEqual({
      version: 3,
      suites: [{ id: suiteId, name: 'Smoke', testIds: ['t-checkout'] }]
    })
    expect(lastSuites()).toEqual([
      {
        id: suiteId,
        name: 'Smoke',
        tests: [{ ...checkout(), file: 'spec/checkout_spec.rb', ownership: 'recorded' }]
      }
    ])
  })

  it('autosaving an existing test updates its file in place', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    await saveRecording(win, suiteId, { ...checkout(), name: 'Checkout renamed' })

    expect((await readdir(join(project, 'spec'))).sort()).toEqual(['checkout_spec.rb'])
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'Checkout renamed'
    )
    expect(lastSuites()[0].tests).toHaveLength(1)
  })

  it('autosaving a listed test reads only its own sidecar, not every one', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const scan = vi.spyOn(sidecars, 'listSidecars')

    await saveRecording(win, suiteId, { ...checkout(), name: 'Checkout renamed' })
    await saveRecording(win, suiteId, {
      ...checkout(),
      name: 'Checkout renamed',
      url: 'https://b.test'
    })

    expect(scan).not.toHaveBeenCalled()
    expect((await readdir(join(project, 'spec'))).sort()).toEqual(['checkout_spec.rb'])
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'Checkout renamed'
    )
  })

  it('save of code-owned returns codeOwned', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    const result = await saveRecording(win, suiteId, { ...checkout(), name: 'Changed' })

    expect(result).toEqual({ success: false, error: 'codeOwned' })
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
    expect(lastSuites()[0].tests[0].ownership).toBe('codeOwnedWasRecorded')

    // Later refused autosaves don't re-send the suites (the renderer would reset its test each time)
    send.mockClear()
    await saveRecording(win, suiteId, { ...checkout(), name: 'Changed again' })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a test whose steps it cannot store', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    const result = await saveRecording(win, suiteId, {
      ...checkout(),
      steps: [{ nope: true }]
    } as never)
    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('delete removes a recorded file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())

    expect(await deleteTest(win, { suiteId, testId: 't-checkout' })).toEqual({ success: true })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(false)
    expect((await readJson(suitesJson(project))).suites).toEqual([
      { id: suiteId, name: 'Smoke', testIds: [] }
    ])
  })

  it('delete keeps code-owned file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    expect(await deleteTest(win, { suiteId, testId: 't-checkout' })).toEqual({ success: true })

    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
    expect((await readJson(suitesJson(project))).suites).toEqual([
      { id: suiteId, name: 'Smoke', testIds: [] }
    ])
    expect(lastSuites()[0].tests).toEqual([])
  })

  it('delete suite keeps tests shared with another suite', async () => {
    await setActiveProject(project)
    const first = await newSuite('First')
    const second = await newSuite('Second')
    await saveRecording(win, first, checkout('shared'))
    await saveRecording(win, second, checkout('shared'))
    await saveRecording(win, first, { ...checkout('only-first'), name: 'Login' })

    expect(await deleteSuite(win, first)).toEqual({ success: true })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(await exists(join(project, 'spec', 'login_spec.rb'))).toBe(false)
    expect((await readJson(suitesJson(project))).suites).toEqual([
      { id: second, name: 'Second', testIds: ['shared'] }
    ])
  })

  it('deleting a test listed in another suite keeps its file', async () => {
    await setActiveProject(project)
    const first = await newSuite('First')
    const second = await newSuite('Second')
    await saveRecording(win, first, checkout('shared'))
    await saveRecording(win, second, checkout('shared'))

    await deleteTest(win, { suiteId: first, testId: 'shared' })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
  })

  it('import never overwrites', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await mkdir(join(project, 'spec'))
    const handWritten = "describe 'Checkout' do\n  it('works') { expect(1).to eq 1 }\nend\n"
    await writeFile(join(project, 'spec', 'checkout_spec.rb'), handWritten)
    await writeFile(join(other, 'checkout.rb'), '# Test: Checkout\n')
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(other, 'checkout.rb')]
    })

    const first = await importTest(win, suiteId)
    await saveRecording(win, suiteId, { ...first.test!, name: 'Other name' })
    const second = await importTest(win, suiteId)

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.test!.id).not.toBe(first.test!.id)
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toBe(handWritten)
    expect((await readdir(join(project, 'spec'))).sort()).toEqual([
      'checkout_2_spec.rb',
      'checkout_3_spec.rb',
      'checkout_spec.rb'
    ])
  })

  it('importSuite and importProject save project files', async () => {
    await setActiveProject(project)
    await mkdir(join(other, 'Imported'))
    await writeFile(join(other, 'Imported', 'one.rb'), '# Test: One\n')
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(other, 'Imported')]
    })
    const suiteResult = await importSuite(win)
    expect(suiteResult.success).toBe(true)
    expect(await exists(join(project, 'spec', 'one_spec.rb'))).toBe(true)

    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [other] })
    expect((await importProject(win)).success).toBe(true)
    // The earlier test's file is kept even though the import replaced the suites
    expect((await readdir(join(project, 'spec'))).sort()).toEqual(['one_2_spec.rb', 'one_spec.rb'])
    const index = await readJson(suitesJson(project))
    expect(index.version).toBe(3)
    expect(index.suites).toHaveLength(1)
  })

  it('saveTrace never rewrites the index', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const before = await readFile(suitesJson(project), 'utf-8')
    const spy = vi.spyOn(persistence, 'saveSuites')

    await saveTrace('t-checkout', [])

    expect(spy).not.toHaveBeenCalled()
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(before)
    expect(lastSuites()[0].tests[0].hasTrace).toBe(true)
  })

  it('restart round trip', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())

    await setActiveProject(null)
    await setActiveProject(project)
    const suites = await getSuites()

    expect(suites).toEqual([
      {
        id: suiteId,
        name: 'Smoke',
        tests: [{ ...checkout(), file: 'spec/checkout_spec.rb', ownership: 'recorded' }]
      }
    ])
  })

  it('a save for a project that is no longer active is refused', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await rspecProject(other)
    await setActiveProject(other)

    const result = await saveRecording(win, suiteId, checkout())

    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
    expect(await exists(join(other, 'spec'))).toBe(false)
  })
})

describe('activation', () => {
  const v2: Suite[] = [{ id: 's1', name: 'Old', tests: [checkout()] }]

  it('cucumber project still uses version 2 suites', async () => {
    await writeFile(join(project, 'Gemfile'), "gem 'cucumber'\ngem 'rspec'\n")
    await setActiveProject(project)
    const suiteId = await newSuite()

    await saveRecording(win, suiteId, checkout())

    const file = await readJson(suitesJson(project))
    expect(file.version).toBe(2)
    expect(await exists(join(project, 'spec'))).toBe(false)
    expect(lastSuites()[0].tests).toEqual([checkout()])
  })

  it('migrates version 2 suites and tells the renderer', async () => {
    await saveSuites(project, v2)

    await setActiveProject(project)

    expect((await readJson(suitesJson(project))).version).toBe(3)
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 1, postponed: false })
    expect(lastSuites()[0].tests[0]).toMatchObject({ id: 't-checkout', ownership: 'recorded' })
  })

  it('says nothing when there was nothing to migrate', async () => {
    await setActiveProject(project)
    expect(send.mock.calls.map(([channel]) => channel)).not.toContain('tests-migrated')
  })

  it('a postponed migration keeps version 2 for this activation', async () => {
    await saveSuites(project, v2)
    vi.spyOn(migration, 'migrateToProjectFiles').mockRejectedValue(
      new migration.MigrationPostponedError('backup', new Error('disk full'))
    )

    await setActiveProject(project)
    await createSuite(win, 'New')

    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 0, postponed: true })
    expect(lastSuites().map((s) => s.name)).toEqual(['Old', 'New'])
    const file = await readJson(suitesJson(project))
    expect(file.version).toBe(2)
    expect(file.suites).toHaveLength(2)
  })

  it('any migration error is treated as postponed', async () => {
    await saveSuites(project, v2)
    vi.spyOn(migration, 'migrateToProjectFiles').mockRejectedValue(new TypeError('boom'))

    const result = await setActiveProject(project)

    expect(result.success).toBe(true)
    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 0, postponed: true })
    expect(lastSuites()[0].tests).toEqual([checkout()])
  })

  it('never writes version 2 over a files-mode project', async () => {
    await setActiveProject(project)
    await newSuite()
    const spy = vi.spyOn(persistence, 'saveSuites')

    await persistence.persistActiveSuites()

    expect(spy).not.toHaveBeenCalled()
    expect((await readJson(suitesJson(project))).version).toBe(3)
  })

  it('a newer suites file opens with no suites and is never written', async () => {
    await mkdir(join(project, '.raider'))
    const newer = JSON.stringify({ version: 9, suites: [] })
    await writeFile(suitesJson(project), newer)

    const result = await setActiveProject(project)
    const created = await createSuite(win, 'Nope')

    expect(result.success).toBe(true)
    expect(appState.suites.size).toBe(0)
    expect(send).toHaveBeenCalledWith('suites-too-new')
    expect(created.success).toBe(false)
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(newer)
  })
})

describe('fix round 1', () => {
  const layout = {
    framework: 'rspec',
    automation: 'selenium',
    specPath: 'spec',
    featurePath: 'features',
    helperPath: 'helpers',
    waitHelper: false,
    recordable: true
  } as const

  it('deleting a test that is not in the suite never deletes its file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    // A recorded file outside any suite, e.g. kept by importProject
    await saveRecordedTest(project, layout, checkout('loose'))

    await deleteTest(win, { suiteId, testId: 'loose' })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
  })

  it('a failed suite delete puts the suite back without undoing other changes', async () => {
    await setActiveProject(project)
    const first = await newSuite('First')
    const second = await newSuite('Second')
    vi.spyOn(persistence, 'saveSuiteIndex').mockImplementationOnce(async () => {
      // Another change lands while the index write is pending
      appState.suiteIndex.set('late', { id: 'late', name: 'Late', testIds: [] })
      throw new Error('disk full')
    })

    expect(await deleteSuite(win, first)).toEqual({ success: false })

    expect(Array.from(appState.suiteIndex.keys())).toEqual([first, second, 'late'])
  })

  it('a failed test delete puts the test back without undoing other changes', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    vi.spyOn(persistence, 'saveSuiteIndex').mockImplementationOnce(async () => {
      appState.suiteIndex.get(suiteId)!.testIds.push('late')
      throw new Error('disk full')
    })

    const result = await deleteTest(win, { suiteId, testId: 't-checkout' })

    expect(result.success).toBe(false)
    expect(appState.suiteIndex.get(suiteId)!.testIds).toEqual(['t-checkout', 'late'])
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
  })

  it('a failed import rolls back only the imported suite', async () => {
    await setActiveProject(project)
    await newSuite('Mine')
    await mkdir(join(other, 'Imported'))
    await writeFile(join(other, 'Imported', 'one.rb'), '# Test: One\n')
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(other, 'Imported')]
    })
    vi.spyOn(persistence, 'saveSuiteIndex').mockImplementationOnce(async () => {
      appState.suiteIndex.set('late', { id: 'late', name: 'Late', testIds: [] })
      throw new Error('disk full')
    })

    const result = await importSuite(win)

    expect(result.success).toBe(false)
    expect(Array.from(appState.suiteIndex.values()).map((e) => e.name)).toEqual(['Mine', 'Late'])
  })

  it('recorded suites in a project that can no longer record are shown read-only', async () => {
    await saveRecordedTest(project, layout, checkout())
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['t-checkout'] }])
    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'capybara'\n")

    await setActiveProject(project)
    const created = await createSuite(win, 'Nope')

    expect(lastSuites()[0].tests[0].id).toBe('t-checkout')
    expect(send.mock.calls.map(([channel]) => channel)).not.toContain('suites-too-new')
    expect(created.success).toBe(false)
    expect(created.error).not.toMatch(/newer/)
    expect(created.error).toMatch(/can no longer record/)
  })

  it('says why opening failed when moved tests cannot be loaded', async () => {
    await saveSuites(project, [{ id: 's1', name: 'Old', tests: [checkout()] }])
    vi.spyOn(assembly, 'assembleFromIndex').mockRejectedValueOnce(new Error('scan failed'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await setActiveProject(project)

    expect(result.success).toBe(false)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('moved to project files but could not be loaded'),
      expect.any(Error)
    )
    // The move itself stands: the tests are safe in the project
    expect((await readJson(suitesJson(project))).version).toBe(3)
  })
})

describe('recorded tests no suite lists', () => {
  const layout = {
    framework: 'rspec',
    automation: 'selenium',
    specPath: 'spec',
    featurePath: 'features',
    helperPath: 'helpers',
    waitHelper: false,
    recordable: true
  } as const
  const NOT_IN_A_SUITE = 'Not in a suite'
  const sidecarJson = (file: string): string => join(project, '.raider', 'tests', `${file}.json`)
  const bucketOf = (suites: Suite[]): Suite[] => suites.filter((s) => s.name === NOT_IN_A_SUITE)

  it('are listed in a "Not in a suite" suite when the project opens', async () => {
    await saveRecordedTest(project, layout, checkout('listed'))
    await saveRecordedTest(project, layout, { ...checkout('loose'), name: 'Loose one' })
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['listed'] }])
    const specBefore = await readFile(join(project, 'spec', 'loose_one_spec.rb'), 'utf-8')
    const sidecarBefore = await readFile(sidecarJson('spec/loose_one_spec.rb'), 'utf-8')

    await setActiveProject(project)

    const suites = await getSuites()
    expect(suites.map((s) => s.name)).toEqual(['Smoke', NOT_IN_A_SUITE])
    expect(bucketOf(suites)[0].tests).toEqual([
      expect.objectContaining({
        id: 'loose',
        file: 'spec/loose_one_spec.rb',
        ownership: 'recorded'
      })
    ])
    expect(lastSuites()).toEqual(suites)
    expect((await readJson(suitesJson(project))).suites).toEqual([
      { id: 's1', name: 'Smoke', testIds: ['listed'] },
      { id: bucketOf(suites)[0].id, name: NOT_IN_A_SUITE, testIds: ['loose'] }
    ])
    // Only the index changes: the test's own files are left as they were
    expect(await readFile(join(project, 'spec', 'loose_one_spec.rb'), 'utf-8')).toBe(specBefore)
    expect(await readFile(sidecarJson('spec/loose_one_spec.rb'), 'utf-8')).toBe(sidecarBefore)
  })

  it('reopening the project keeps one such suite and lists each test once', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    await setActiveProject(project)
    await setActiveProject(null)
    await saveRecordedTest(project, layout, { ...checkout('later'), name: 'Later one' })

    await setActiveProject(project)

    const bucket = bucketOf(await getSuites())
    expect(bucket).toHaveLength(1)
    expect(bucket[0].tests.map((t) => t.id)).toEqual(['loose', 'later'])
  })

  it('after a damaged suites file, every recorded test can be reached again', async () => {
    await saveRecordedTest(project, layout, checkout('one'))
    await saveRecordedTest(project, layout, { ...checkout('two'), name: 'Two' })
    await writeFile(suitesJson(project), '{ not json')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await setActiveProject(project)

    const suites = await getSuites()
    expect(suites).toHaveLength(1)
    expect(suites[0].name).toBe(NOT_IN_A_SUITE)
    expect(suites[0].tests.map((t) => t.id).sort()).toEqual(['one', 'two'])
  })

  it('a test edited in code is listed too, still view-only', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    await setActiveProject(project)

    expect(bucketOf(await getSuites())[0].tests[0]).toMatchObject({
      id: 'loose',
      ownership: 'codeOwnedWasRecorded'
    })
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
  })

  it('two records with the same id resolve to the same file every time', async () => {
    await saveRecordedTest(project, layout, checkout('dup'))
    // A copy left behind by a crash mid-rename: same id, another file
    const sidecar = JSON.parse(await readFile(sidecarJson('spec/checkout_spec.rb'), 'utf-8'))
    await mkdir(join(project, 'spec', 'a'), { recursive: true })
    await mkdir(join(project, '.raider', 'tests', 'spec', 'a'), { recursive: true })
    await writeFile(
      join(project, 'spec', 'a', 'checkout_spec.rb'),
      await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')
    )
    await writeFile(
      sidecarJson('spec/a/checkout_spec.rb'),
      JSON.stringify({ ...sidecar, file: 'spec/a/checkout_spec.rb' })
    )

    await setActiveProject(project)
    const first = bucketOf(await getSuites())
    await setActiveProject(null)
    await setActiveProject(project)
    const second = bucketOf(await getSuites())

    expect(first[0].tests).toHaveLength(1)
    expect(first[0].tests[0].file).toBe('spec/a/checkout_spec.rb')
    expect(second[0].tests.map((t) => t.file)).toEqual(['spec/a/checkout_spec.rb'])
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
  })

  it('the project still opens, with the test reachable, if the index cannot be written', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    vi.spyOn(persistence, 'saveSuiteIndex').mockRejectedValueOnce(new Error('read-only disk'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await setActiveProject(project)

    expect(result.success).toBe(true)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('in no suite'),
      expect.objectContaining({ message: 'read-only disk' })
    )
    expect(bucketOf(await getSuites())[0].tests.map((t) => t.id)).toEqual(['loose'])
  })

  it('the "Not in a suite" suite cannot be deleted, so its files stay', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    await setActiveProject(project)
    const bucketId = bucketOf(await getSuites())[0].id
    const indexBefore = await readFile(suitesJson(project), 'utf-8')

    expect(await deleteSuite(win, bucketId)).toEqual({ success: false })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(await exists(sidecarJson('spec/checkout_spec.rb'))).toBe(true)
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(indexBefore)
    expect(bucketOf(await getSuites())[0].tests.map((t) => t.id)).toEqual(['loose'])
  })

  it('nothing is added when every recorded test is in a suite', async () => {
    await saveRecordedTest(project, layout, checkout('listed'))
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['listed'] }])
    const before = await readFile(suitesJson(project), 'utf-8')

    await setActiveProject(project)

    expect((await getSuites()).map((s) => s.name)).toEqual(['Smoke'])
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(before)
  })

  it('a project that can no longer record is left unchanged', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    await saveSuiteIndex(project, [])
    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'capybara'\n")
    const before = await readFile(suitesJson(project), 'utf-8')

    await setActiveProject(project)

    expect(await getSuites()).toEqual([])
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(before)
  })
})
