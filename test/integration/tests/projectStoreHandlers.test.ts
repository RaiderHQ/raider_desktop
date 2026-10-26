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
import { runSuiteHandler, runTestHandler } from '../../../src/main/handlers/testing/runProjectTests'
import * as migration from '../../../src/main/handlers/tests/migrateToProjectFiles'
import * as assembly from '../../../src/main/handlers/tests/assembleSuites'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import * as persistence from '../../../src/main/handlers/suitePersistence'
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

    expect(result).toEqual({ success: true })
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

  it('run uses project file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())

    const result = await runTestHandler(suiteId, 't-checkout', '/elsewhere', 'ruby')

    expect(result.success).toBe(true)
    expect(mockSafeExec).toHaveBeenCalledTimes(1)
    const [command, options] = mockSafeExec.mock.calls[0]
    expect(command).toContain('spec/checkout_spec.rb')
    expect(command).toContain('-S rspec')
    expect(command).toContain('--format json')
    // No generated temporary file (those are named test_<time>.rb)
    expect(command).not.toMatch(/test_\d+[^ ]*\.rb/)
    expect(options.cwd).toBe(project)
  })

  it('run saves the test it was given before running it', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const edited = {
      ...checkout(),
      steps: [{ id: 'n', kind: 'navigate', url: 'https://shop.test/edited' }]
    } as Test

    await runTestHandler(suiteId, 't-checkout', project, 'ruby', edited)

    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'https://shop.test/edited'
    )
  })

  it('run still runs a code-owned file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    await runTestHandler(suiteId, 't-checkout', project, 'ruby', { ...checkout(), name: 'New' })

    expect(mockSafeExec.mock.calls[0][0]).toContain('spec/checkout_spec.rb')
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
  })

  it('run suite runs every file of the suite in one rspec call', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    await saveRecording(win, suiteId, { ...checkout('t-login'), name: 'Login' })

    const result = await runSuiteHandler(suiteId, '', 'ruby')

    expect(result.success).toBe(true)
    const [command, options] = mockSafeExec.mock.calls[0]
    expect(command).toContain('spec/checkout_spec.rb')
    expect(command).toContain('spec/login_spec.rb')
    expect(options.cwd).toBe(project)
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
    recordable: true
  } as const

  it('run restores a missing recorded file before running it', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await rm(spec)

    const result = await runTestHandler(suiteId, 't-checkout', project, 'ruby')

    expect(result.success).toBe(true)
    expect(await exists(spec)).toBe(true)
    expect(mockSafeExec.mock.calls[0][0]).toContain('spec/checkout_spec.rb')
  })

  it('run saves a test that is not saved yet instead of saying not found', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()

    const result = await runTestHandler(suiteId, 't-new', project, 'ruby', checkout('t-new'))

    expect(result.success).toBe(true)
    expect(mockSafeExec.mock.calls[0][0]).toContain('spec/checkout_spec.rb')
    expect((await readJson(suitesJson(project))).suites).toEqual([
      { id: suiteId, name: 'Smoke', testIds: ['t-new'] }
    ])
  })

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
