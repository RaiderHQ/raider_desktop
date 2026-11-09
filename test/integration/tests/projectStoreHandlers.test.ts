import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir, chmod } from 'fs/promises'
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
import * as loading from '../../../src/main/handlers/tests/loadTests'
import {
  filesStore,
  saveRecordedTestInProject,
  tagSavedTest
} from '../../../src/main/handlers/tests/recordedStore'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import * as sidecars from '../../../src/main/handlers/tests/sidecar'
import { readSidecar } from '../../../src/main/handlers/tests/sidecar'
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

    const result = await saveRecording(win, project, checkout())

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
    await saveRecording(win, project, checkout())
    await saveRecording(win, project, { ...checkout(), name: 'Checkout renamed' })

    expect((await readdir(join(project, 'spec'))).sort()).toEqual(['checkout_spec.rb'])
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'Checkout renamed'
    )
    expect(lastTests()).toHaveLength(1)
  })

  it('autosaving a known test reads only its own sidecar, not every one', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    await saveRecording(win, project, checkout('other'))
    const scan = vi.spyOn(sidecars, 'listSidecars')

    await saveRecording(win, project, { ...checkout(), name: 'Checkout again' })

    expect(scan).not.toHaveBeenCalled()
  })

  it('save of code-owned returns codeOwned', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    const result = await saveRecording(win, project, { ...checkout(), name: 'Renamed' })

    expect(result).toEqual({ success: false, error: 'codeOwned' })
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
    expect(lastTests()[0].ownership).toBe('codeOwnedWasRecorded')
  })

  it('refuses a test whose steps it cannot store', async () => {
    await setActiveProject(project)

    const result = await saveRecording(win, project, {
      ...checkout(),
      steps: [{ nope: true }]
    } as never)

    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('delete removes a recorded file', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())

    expect(await deleteTest(win, { testId: 't-checkout' })).toEqual({ success: true })

    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(false)
    expect(lastTests()).toEqual([])
  })

  it('delete keeps code-owned file', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    expect(await deleteTest(win, { testId: 't-checkout' })).toEqual({
      success: true,
      codeOwned: true
    })

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
    await saveRecording(win, project, { ...first.test!, name: 'Other name' })
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
    await saveRecording(win, project, checkout())

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
    const result = await saveRecording(win, project, checkout())
    expect(result).toEqual({ success: false, error: 'No project is open.' })
  })
})

describe('a flow never gets a check', () => {
  const assertStep = {
    id: 'a1',
    kind: 'assert',
    check: 'displayed',
    element: { strategy: 'id', value: 'done' }
  } as const
  const withCheck = (test: Test): Test => ({ ...test, steps: [...test.steps, assertStep] })
  const FLOW_CHECK_ERROR = 'A flow has no checks. Remove the check to save it.'

  beforeEach(() => {
    appState.recordingMode = 'test'
  })
  afterEach(() => {
    appState.recordingMode = 'test'
  })

  it('rejects an assert step for a flow from the renderer', async () => {
    await setActiveProject(project)
    appState.tests.set('t-flow', { ...checkout('t-flow'), kind: 'flow' })

    // The renderer leaves kind out (or says test): main's record of the flow wins
    for (const kind of [undefined, 'test'] as const) {
      const result = await saveRecording(win, project, { ...withCheck(checkout('t-flow')), kind })
      expect(result).toEqual({ success: false, error: FLOW_CHECK_ERROR })
    }
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('rejects an assert step when the renderer says the test is a flow', async () => {
    await setActiveProject(project)
    const result = await saveRecording(win, project, { ...withCheck(checkout()), kind: 'flow' })
    expect(result).toEqual({ success: false, error: FLOW_CHECK_ERROR })
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('rejects an assert step in a new test saved while a flow is recorded', async () => {
    await setActiveProject(project)
    appState.recordingMode = 'flow'
    const result = await saveRecording(win, project, withCheck(checkout()))
    expect(result).toEqual({ success: false, error: FLOW_CHECK_ERROR })
  })

  it('still saves an existing test with a check while a flow is recorded', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    appState.recordingMode = 'flow'
    expect((await saveRecording(win, project, withCheck(checkout()))).success).toBe(true)
  })

  it('saves a check in a test', async () => {
    await setActiveProject(project)
    expect((await saveRecording(win, project, withCheck(checkout()))).success).toBe(true)
  })

  it("rejects a check for a test whose sidecar is a flow, even when it isn't in the snapshot", async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const json = sidecarJson('spec/checkout_spec.rb')
    await writeFile(
      json,
      JSON.stringify({ ...JSON.parse(await readFile(json, 'utf-8')), kind: 'flow' })
    )
    appState.tests.delete('t-checkout')

    // A clean save first must not rewrite the flow's sidecar as a test's
    const clean = await saveRecording(win, project, checkout())
    expect(clean.success).toBe(false)
    expect(JSON.parse(await readFile(json, 'utf-8')).kind).toBe('flow')

    const result = await saveRecording(win, project, withCheck(checkout()))
    expect(result).toEqual({ success: false, error: FLOW_CHECK_ERROR })
  })

  it('refuses a save when the snapshot says test but the sidecar on disk says flow', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const json = sidecarJson('spec/checkout_spec.rb')
    await writeFile(
      json,
      JSON.stringify({ ...JSON.parse(await readFile(json, 'utf-8')), kind: 'flow' })
    )

    for (const test of [checkout(), withCheck(checkout())]) {
      expect((await saveRecording(win, project, test)).success).toBe(false)
    }
    expect(JSON.parse(await readFile(json, 'utf-8')).kind).toBe('flow')
  })

  it('loads the kind from the sidecar, so a reloaded flow keeps refusing checks', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const json = sidecarJson('spec/checkout_spec.rb')
    await writeFile(
      json,
      JSON.stringify({ ...JSON.parse(await readFile(json, 'utf-8')), kind: 'flow' })
    )
    await setActiveProject(null)
    await setActiveProject(project)

    expect(appState.tests.get('t-checkout')?.kind).toBe('flow')
    const result = await saveRecording(win, project, withCheck(checkout()))
    expect(result).toEqual({ success: false, error: FLOW_CHECK_ERROR })
  })

  it('does not write a flow through the test writer', async () => {
    await setActiveProject(project)
    const result = await saveRecording(win, project, { ...checkout(), kind: 'flow' })
    expect(result.success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('saves a new flow to flows/<stem>_flow.rb and keeps it a flow on every save', async () => {
    await mkdir(join(project, 'flows'))
    await writeFile(join(project, 'flows', 'flow_helper.rb'), '# helper\n')
    await setActiveProject(project)

    const first = await saveRecording(win, project, { ...checkout('f-new'), kind: 'flow' })
    expect(first).toMatchObject({
      success: true,
      test: { kind: 'flow', file: 'flows/checkout_flow.rb' }
    })
    // The renderer leaves kind out on an autosave: main's record keeps it a flow
    const again = await saveRecording(win, project, { ...checkout('f-new'), name: 'Pay' })
    expect(again).toMatchObject({
      success: true,
      test: { kind: 'flow', file: 'flows/checkout_flow.rb' }
    })
    expect((await readSidecar(project, 'flows/checkout_flow.rb'))?.kind).toBe('flow')
    expect(await exists(join(project, 'spec'))).toBe(false)

    // A new recording while the recorder records a flow is a flow too
    appState.recordingMode = 'flow'
    const fromMode = await saveRecording(win, project, checkout('f-mode'))
    expect(fromMode).toMatchObject({ success: true, test: { kind: 'flow' } })
  })

  it('tells the user to set up flows when flows/flow_helper.rb is missing', async () => {
    await setActiveProject(project)
    const result = await saveRecording(win, project, { ...checkout(), kind: 'flow' })
    expect(result).toEqual({
      success: false,
      error: 'Set up flows first: run raider flow init in this project.'
    })
  })

  it('refuses a malformed test as before, without throwing', async () => {
    await setActiveProject(project)
    for (const bad of [{ ...checkout(), steps: 'x' }, { ...checkout(), steps: [null] }, null]) {
      const result = await saveRecording(win, project, bad as never)
      expect(result.success).toBe(false)
    }
  })
})

describe('activation', () => {
  const suites = JSON.stringify({
    version: 2,
    suites: [{ id: 's1', name: 'Old', tests: [checkout()] }]
  })
  const writeSuites = async (body: string): Promise<void> => {
    await mkdir(join(project, '.raider'), { recursive: true })
    await writeFile(suitesJson(project), body)
  }

  it('a project that cannot record shows its recorded tests and refuses to change them', async () => {
    await saveRecordedTest(project, layout, checkout())
    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'capybara'\n")

    await setActiveProject(project)
    const saved = await saveRecording(win, project, checkout())

    expect(lastTests()[0].id).toBe('t-checkout')
    expect(saved.success).toBe(false)
    expect(saved.error).toMatch(/can't record/)
  })

  it('never opens suites.json: a file of any age or state is left exactly as it is', async () => {
    for (const body of [suites, JSON.stringify({ version: 9, suites: [] }), '{not json']) {
      await writeSuites(body)
      const result = await setActiveProject(project)
      expect(result.success).toBe(true)
      expect(await readFile(suitesJson(project), 'utf-8')).toBe(body)
    }
    // Its tests are not turned into spec files, and nothing about it is announced
    expect(await exists(join(project, 'spec'))).toBe(false)
    expect(send.mock.calls.map(([channel]) => channel).sort()).toEqual(
      ['tests-updated', 'tests-updated', 'tests-updated'].sort()
    )
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

describe('saves are tied to the project the renderer is working on', () => {
  it('refuses a save for another project with a fixed error', async () => {
    await setActiveProject(project)

    const result = await saveRecording(win, other, checkout())

    expect(result).toEqual({
      success: false,
      error: 'The project was closed before this change could be saved.'
    })
    expect(await exists(join(project, 'spec'))).toBe(false)
    expect(await exists(join(other, 'spec'))).toBe(false)
  })

  it('refuses a save with no project path at all', async () => {
    await setActiveProject(project)
    expect((await saveRecording(win, undefined, checkout())).success).toBe(false)
    expect(await exists(join(project, 'spec'))).toBe(false)
  })
})

describe('deleting', () => {
  it('keeps the test when its files cannot be removed, and says so', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const spec = join(project, 'spec')
    await chmod(spec, 0o555)
    try {
      const result = await deleteTest(win, { testId: 't-checkout' })

      // Running as root can delete anyway; elsewhere the failure must keep the test
      if (!result.success) {
        expect(result.error).toBe('The test could not be deleted.')
        expect(appState.tests.has('t-checkout')).toBe(true)
        expect(await exists(join(spec, 'checkout_spec.rb'))).toBe(true)
      }
    } finally {
      await chmod(spec, 0o755)
    }
  })

  it('reports a failed removal without touching the list', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const recordedTests = await import('../../../src/main/handlers/tests/recordedTests')
    vi.spyOn(recordedTests, 'deleteRecordedTest').mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' })
    )

    const result = await deleteTest(win, { testId: 't-checkout' })

    expect(result).toEqual({ success: false, error: 'The test could not be deleted.' })
    expect(appState.tests.has('t-checkout')).toBe(true)
  })

  it('says a test edited in code kept its file', async () => {
    await setActiveProject(project)
    await saveRecording(win, project, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    expect(await deleteTest(win, { testId: 't-checkout' })).toEqual({
      success: true,
      codeOwned: true
    })
    expect(appState.tests.has('t-checkout')).toBe(false)
  })
})

describe('tagSavedTest', () => {
  it('writes the tags into the sidecar and the describe line, and the stored copy', async () => {
    await setActiveProject(project)
    const saved = await saveRecording(win, project, checkout())

    const tagged = await tagSavedTest(filesStore()!, saved.test!, ['Smoke', 'login', 'bad tag'])

    expect(tagged.tags).toEqual(['login', 'smoke'])
    expect(appState.tests.get('t-checkout')?.tags).toEqual(['login', 'smoke'])
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      "describe 'Checkout', :login, :smoke do"
    )
    expect((await readSidecar(project, 'spec/checkout_spec.rb'))?.tags).toEqual(['login', 'smoke'])
  })

  it('does nothing without tags', async () => {
    await setActiveProject(project)
    const saved = await saveRecording(win, project, checkout())
    expect(await tagSavedTest(filesStore()!, saved.test!, [])).toBe(saved.test)
  })

  it('keeps the test, untagged, when the tags cannot be written', async () => {
    await setActiveProject(project)
    const saved = await saveRecording(win, project, checkout())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const recordedTests = await import('../../../src/main/handlers/tests/recordedTests')
    vi.spyOn(recordedTests, 'setTagsForFile').mockRejectedValueOnce(new Error('disk full'))

    expect(await tagSavedTest(filesStore()!, saved.test!, ['smoke'])).toBe(saved.test)
    expect(appState.tests.get('t-checkout')?.tags).toBeUndefined()
  })
})

describe('recorded tests found in the project', () => {
  it('every recorded test is listed when the project opens', async () => {
    await saveRecordedTest(project, layout, checkout('a'))
    await saveRecordedTest(project, layout, { ...checkout('b'), name: 'Second' })

    await setActiveProject(project)

    expect(
      lastTests()
        .map((t) => t.id)
        .sort()
    ).toEqual(['a', 'b'])
  })

  it('ignores a sidecar stored somewhere other than its file says', async () => {
    await saveRecordedTest(project, layout, checkout('real'))
    const sidecar = JSON.parse(await readFile(sidecarJson('spec/checkout_spec.rb'), 'utf-8'))
    await mkdir(join(project, '.raider', 'tests', 'spec', 'elsewhere'), { recursive: true })
    await writeFile(
      sidecarJson('spec/elsewhere/other_spec.rb'),
      JSON.stringify({ ...sidecar, id: 'stray', file: 'spec/checkout_spec.rb' })
    )

    expect((await loading.loadRecordedTests(project)).map((t) => t.id)).toEqual(['real'])
  })

  it('a missing spec file still counts as recorded', async () => {
    await saveRecordedTest(project, layout, checkout('gone'))
    await rm(join(project, 'spec', 'checkout_spec.rb'))

    expect(await loading.loadRecordedTests(project)).toEqual([
      expect.objectContaining({ id: 'gone', ownership: 'recorded' })
    ])
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
