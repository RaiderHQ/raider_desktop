import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const { mockUserData, mockSafeExec } = vi.hoisted(() => ({
  mockUserData: { dir: '' },
  mockSafeExec: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => mockUserData.dir },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() }
}))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import { appState } from '../../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import createSuite from '../../../src/main/handlers/createSuite'
import saveRecording from '../../../src/main/handlers/recording/saveRecording'
import { prepareSuiteRun, prepareTestRun } from '../../../src/main/handlers/testing/prepareRuns'
import * as suiteStore from '../../../src/main/handlers/tests/suiteStore'
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

const checkout = (id = 't-checkout'): Test => ({
  id,
  name: 'Checkout',
  url: 'https://shop.test',
  steps: [{ id: `${id}-s1`, kind: 'navigate', url: 'https://shop.test/cart' }]
})
const login = (): Test => ({ ...checkout('t-login'), name: 'Login' })

async function newSuite(name = 'Smoke'): Promise<string> {
  const result = await createSuite(win, name)
  expect(result.success).toBe(true)
  return result.suite!.id
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-prep-'))
  other = await mkdtemp(join(tmpdir(), 'raider-prep-other-'))
  mockUserData.dir = other
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  appState.projectPath = null
  appState.suites = new Map()
  appState.mainWindow = win
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  send.mockClear()
  mockSafeExec.mockReset()
})

afterEach(async () => {
  await setActiveProject(null)
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
  await rm(other, { recursive: true, force: true })
})

describe('prepareTestRun', () => {
  it('returns legacy mode without a files-mode project', async () => {
    await setActiveProject(null)
    expect(await prepareTestRun('s', 't')).toEqual({ mode: 'legacy' })
  })

  it('saves the given test when it differs from the cached one', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const edited = {
      ...checkout(),
      steps: [{ id: 'n', kind: 'navigate', url: 'https://shop.test/edited' }]
    } as Test

    expect(await prepareTestRun(suiteId, 't-checkout', edited)).toEqual({
      mode: 'files',
      file: 'spec/checkout_spec.rb'
    })
    expect(await readFile(join(project, 'spec', 'checkout_spec.rb'), 'utf-8')).toContain(
      'https://shop.test/edited'
    )
  })

  it('saves a test that is not saved yet', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    expect(await prepareTestRun(suiteId, 't-new', checkout('t-new'))).toEqual({
      mode: 'files',
      file: 'spec/checkout_spec.rb'
    })
  })

  it('restores a missing recorded file', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await rm(spec)

    expect(await prepareTestRun(suiteId, 't-checkout')).toEqual({
      mode: 'files',
      file: 'spec/checkout_spec.rb'
    })
    expect(await exists(spec)).toBe(true)
  })

  it('returns a code-owned file without saving', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const spec = join(project, 'spec', 'checkout_spec.rb')
    await writeFile(spec, (await readFile(spec, 'utf-8')) + '\nputs "hand edit"\n')

    const result = await prepareTestRun(suiteId, 't-checkout', { ...checkout(), name: 'New' })

    expect(result).toEqual({ mode: 'files', file: 'spec/checkout_spec.rb' })
    expect(await readFile(spec, 'utf-8')).toContain('hand edit')
  })

  it('reports a failed save', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    vi.spyOn(suiteStore, 'saveTestInSuite').mockRejectedValue(new Error('disk full'))

    expect(await prepareTestRun(suiteId, 't-new', checkout('t-new'))).toEqual({
      error: 'The test could not be saved, so it was not run.'
    })
  })

  it('reports an unknown test', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    expect(await prepareTestRun(suiteId, 'nope')).toEqual({
      error: 'Test with ID nope not found.'
    })
  })
})

describe('prepareSuiteRun', () => {
  it('returns legacy mode without a files-mode project', async () => {
    await setActiveProject(null)
    expect(await prepareSuiteRun('s')).toEqual({ mode: 'legacy' })
  })

  it('lists every file of the suite', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    await saveRecording(win, suiteId, login())

    expect(await prepareSuiteRun(suiteId)).toEqual({
      mode: 'files',
      files: ['spec/checkout_spec.rb', 'spec/login_spec.rb'],
      skipped: []
    })
  })

  it('restores missing recorded files and skips a gone code-owned one', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    await saveRecording(win, suiteId, login())
    await rm(join(project, 'spec', 'checkout_spec.rb'))
    const loginSpec = join(project, 'spec', 'login_spec.rb')
    await writeFile(loginSpec, (await readFile(loginSpec, 'utf-8')) + '\nputs "hand edit"\n')
    await setActiveProject(project)
    await rm(loginSpec)
    await setActiveProject(project)

    expect(await prepareSuiteRun(suiteId)).toEqual({
      mode: 'files',
      files: ['spec/checkout_spec.rb'],
      skipped: ['spec/login_spec.rb']
    })
    expect(await exists(join(project, 'spec', 'checkout_spec.rb'))).toBe(true)
    expect(await exists(loginSpec)).toBe(false)
  })

  it('reports an error when every file is gone', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, login())
    const loginSpec = join(project, 'spec', 'login_spec.rb')
    await writeFile(loginSpec, (await readFile(loginSpec, 'utf-8')) + '\nputs "hand edit"\n')
    await setActiveProject(project)
    await rm(loginSpec)
    await setActiveProject(project)

    expect(await prepareSuiteRun(suiteId)).toEqual({ error: 'This suite has no tests to run.' })
  })

  it('lists duplicate files once', async () => {
    await setActiveProject(project)
    const suiteId = await newSuite()
    await saveRecording(win, suiteId, checkout())
    const store = suiteStore.filesStore()!
    const suite = store.suites.get(suiteId)!
    store.suites.set(suiteId, {
      ...suite,
      tests: [...suite.tests, { ...suite.tests[0], id: 'dup' }]
    })

    expect(await prepareSuiteRun(suiteId)).toEqual({
      mode: 'files',
      files: ['spec/checkout_spec.rb'],
      skipped: []
    })
  })

  it('reports an unknown suite', async () => {
    await setActiveProject(project)
    expect(await prepareSuiteRun('nope')).toEqual({ error: 'Suite with ID nope not found.' })
  })
})
