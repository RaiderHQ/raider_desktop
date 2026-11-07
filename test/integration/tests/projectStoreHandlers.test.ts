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
import deleteTest from '../../../src/main/handlers/deleteTest'
import saveRecording from '../../../src/main/handlers/recording/saveRecording'
import importTest from '../../../src/main/handlers/io/importTest'
import getTests from '../../../src/main/handlers/getTests'
import * as migration from '../../../src/main/handlers/tests/migrateToProjectFiles'
import * as loading from '../../../src/main/handlers/tests/loadTests'
import { filesStore, saveRecordedTestInProject } from '../../../src/main/handlers/tests/suiteStore'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import * as sidecars from '../../../src/main/handlers/tests/sidecar'
import { saveSuiteIndex } from '../../../src/main/handlers/suitePersistence'
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
const sidecarJson = (file: string): string => join(project, '.raider', 'tests', `${file}.json`)

const checkout = (id = 't-checkout'): Test => ({
  id,
  name: 'Checkout',
  url: 'https://shop.test',
  steps: [{ id: `${id}-s1`, kind: 'navigate', url: 'https://shop.test/cart' }]
})

const layout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  waitHelper: false,
  recordable: true
} as const

/** What the renderer was last told the project's tests are. */
const lastTests = (): Test[] => {
  const calls = send.mock.calls.filter(([channel]) => channel === 'tests-updated')
  return calls.at(-1)![1]
}

async function rspecProject(dir: string): Promise<void> {
  await writeFile(join(dir, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-store-'))
  other = await mkdtemp(join(tmpdir(), 'raider-store-other-'))
  mockUserData.dir = other
  await rspecProject(project)
  appState.projectPath = null
  appState.tests = new Map()
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
  it('save writes the spec file and its record, and tells the renderer', async () => {
    await setActiveProject(project)

    const result = await saveRecording(win, checkout())

    // The saved test comes back with its file, so the page can say where it went
    expect(result).toEqual({
      success: true,
      test: expect.objectContaining({ id: 't-checkout', file: 'spec/checkout_spec.rb' })
    })
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(await exists(sidecarJson('spec/checkout_spec.rb'))).toBe(true)
    // No suites file is written for it any more
    expect(await exists(suitesJson(project))).toBe(false)
    expect(lastTests()).toEqual([
      { ...checkout(), file: 'spec/checkout_spec.rb', ownership: 'recorded' }
    ])
  })

  it('autosaving an existing test updates its file in place', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())
    await saveRecording(win, { ...checkout(), name: 'Checkout renamed' })

    expect((await readdir(join(project, 'spec'))).sort()).toEqual(['checkout_spec.rb'])
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'Checkout renamed'
    )
    expect(lastTests()).toHaveLength(1)
  })

  it('autosaving a known test reads only its own sidecar, not every one', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())
    await saveRecording(win, checkout('other'))
    const scan = vi.spyOn(sidecars, 'listSidecars')

    await saveRecording(win, { ...checkout(), name: 'Checkout again' })

    expect(scan).not.toHaveBeenCalled()
  })

  it('save of code-owned returns codeOwned', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    const result = await saveRecording(win, { ...checkout(), name: 'Renamed' })

    expect(result).toEqual({ success: false, error: 'codeOwned' })
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
    expect(lastTests()[0].ownership).toBe('codeOwnedWasRecorded')
  })

  it('refuses a test whose steps it cannot store', async () => {
    await setActiveProject(project)

    const result = await saveRecording(win, { ...checkout(), steps: [{ nope: true }] } as never)

    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('delete removes a recorded file', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())

    expect(await deleteTest(win, { testId: 't-checkout' })).toEqual({ success: true })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(false)
    expect(lastTests()).toEqual([])
  })

  it('delete keeps code-owned file', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    expect(await deleteTest(win, { testId: 't-checkout' })).toEqual({ success: true })

    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
    expect(lastTests()).toEqual([])
  })

  it('import never overwrites', async () => {
    await setActiveProject(project)
    await mkdir(join(project, 'spec'))
    const handWritten = "describe 'Checkout' do\n  it('works') { expect(1).to eq 1 }\nend\n"
    await writeFile(join(project, 'spec', 'checkout_spec.rb'), handWritten)
    await writeFile(join(other, 'checkout.rb'), '# Test: Checkout\n')
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(other, 'checkout.rb')]
    })

    const first = await importTest(win)
    await saveRecording(win, { ...first.test!, name: 'Other name' })
    const second = await importTest(win)

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

  it('import takes the tags of the describe line', async () => {
    await setActiveProject(project)
    await writeFile(
      join(other, 'login.rb'),
      "# Test: Login\ndescribe 'Login', :smoke, :regression do\nend\n"
    )
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(other, 'login.rb')]
    })

    const result = await importTest(win)

    expect(result.test!.tags).toEqual(['regression', 'smoke'])
    expect(await readFile(join(project, 'spec', 'login_spec.rb'), 'utf-8')).toContain(
      ':regression, :smoke'
    )
  })

  it('restart round trip', async () => {
    await setActiveProject(project)
    await saveRecording(win, checkout())

    await setActiveProject(null)
    await setActiveProject(project)

    expect(await getTests()).toEqual([
      { ...checkout(), file: 'spec/checkout_spec.rb', ownership: 'recorded' }
    ])
  })

  it('a save through the store of a project that is no longer active is refused', async () => {
    await setActiveProject(project)
    const stale = filesStore()!
    await rspecProject(other)
    await setActiveProject(other)

    const result = await saveRecordedTestInProject(stale, checkout())

    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
    expect(await exists(join(other, 'spec'))).toBe(false)
  })

  it('a save without a project says so', async () => {
    const result = await saveRecording(win, checkout())
    expect(result).toEqual({ success: false, error: 'No project is open.' })
  })
})

describe('activation', () => {
  const v2 = (): unknown => ({
    version: 2,
    suites: [{ id: 's1', name: 'Old', tests: [checkout()] }]
  })

  it('a project that cannot record is locked and shows no tests', async () => {
    await writeFile(join(project, 'Gemfile'), "gem 'cucumber'\ngem 'rspec'\n")
    await setActiveProject(project)

    const result = await saveRecording(win, checkout())

    expect(appState.suiteMode).toBe('locked')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/can no longer record/)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('migrates version 2 suites and tells the renderer', async () => {
    await mkdir(join(project, '.raider'))
    await writeFile(suitesJson(project), JSON.stringify(v2()))

    await setActiveProject(project)

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 1, postponed: false })
    expect(lastTests()[0]).toMatchObject({ id: 't-checkout', ownership: 'recorded' })
  })

  it('says nothing when there was nothing to migrate', async () => {
    await setActiveProject(project)
    expect(send.mock.calls.map(([channel]) => channel)).not.toContain('tests-migrated')
  })

  it('a postponed migration says so and the project still opens', async () => {
    await mkdir(join(project, '.raider'))
    await writeFile(suitesJson(project), JSON.stringify(v2()))
    vi.spyOn(migration, 'migrateToProjectFiles').mockRejectedValue(
      new migration.MigrationPostponedError('backup', new Error('disk full'))
    )

    const result = await setActiveProject(project)

    expect(result.success).toBe(true)
    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 0, postponed: true })
    expect((await readJson(suitesJson(project))).version).toBe(2)
  })

  it('any migration error is treated as postponed', async () => {
    vi.spyOn(migration, 'migrateToProjectFiles').mockRejectedValue(new TypeError('boom'))

    const result = await setActiveProject(project)

    expect(result.success).toBe(true)
    expect(send).toHaveBeenCalledWith('tests-migrated', { migrated: 0, postponed: true })
  })

  it('a newer suites file opens with no tests and is never written', async () => {
    await mkdir(join(project, '.raider'))
    const newer = JSON.stringify({ version: 9, suites: [] })
    await writeFile(suitesJson(project), newer)

    const result = await setActiveProject(project)
    const saved = await saveRecording(win, checkout())

    expect(result.success).toBe(true)
    expect(appState.tests.size).toBe(0)
    expect(send).toHaveBeenCalledWith('tests-too-new')
    expect(saved.success).toBe(false)
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(newer)
  })

  it('recorded tests in a project that can no longer record are shown read-only', async () => {
    await saveRecordedTest(project, layout, checkout())
    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'capybara'\n")

    await setActiveProject(project)
    const saved = await saveRecording(win, checkout())

    expect(lastTests()[0].id).toBe('t-checkout')
    expect(send.mock.calls.map(([channel]) => channel)).not.toContain('tests-too-new')
    expect(saved.success).toBe(false)
    expect(saved.error).not.toMatch(/newer/)
    expect(saved.error).toMatch(/can no longer record/)
  })

  it('says why opening failed when the tests cannot be loaded', async () => {
    vi.spyOn(loading, 'loadRecordedTests').mockRejectedValueOnce(new Error('scan failed'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await setActiveProject(project)

    expect(result.success).toBe(false)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Could not load the recorded tests'),
      expect.any(Error)
    )
  })
})

describe('recorded tests found in the project', () => {
  it('every recorded test is listed when the project opens, with or without a suites file', async () => {
    await saveRecordedTest(project, layout, checkout('a'))
    await saveRecordedTest(project, layout, { ...checkout('b'), name: 'Second' })
    await saveSuiteIndex(project, [{ id: 's1', name: 'Smoke', testIds: ['a'] }])
    const before = await readFile(suitesJson(project), 'utf-8')

    await setActiveProject(project)

    expect(
      lastTests()
        .map((t) => t.id)
        .sort()
    ).toEqual(['a', 'b'])
    // Opening a project never writes the suites file any more
    expect(await readFile(suitesJson(project), 'utf-8')).toBe(before)
  })

  it('a test edited in code is listed too, still view-only', async () => {
    await saveRecordedTest(project, layout, checkout('loose'))
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    await setActiveProject(project)

    expect(lastTests()[0]).toMatchObject({ id: 'loose', ownership: 'codeOwnedWasRecorded' })
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
    const first = await getTests()
    await setActiveProject(null)
    await setActiveProject(project)
    const second = await getTests()

    expect(first).toHaveLength(1)
    expect(first[0].file).toBe('spec/a/checkout_spec.rb')
    expect(second.map((t) => t.file)).toEqual(['spec/a/checkout_spec.rb'])
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
  })
})
