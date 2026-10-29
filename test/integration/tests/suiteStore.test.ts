import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockUserData = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: (): string => mockUserData.dir }
}))
vi.mock('../../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import { appState } from '../../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import getSuites from '../../../src/main/handlers/getSuites'
import { filesStore, saveTestInSuite } from '../../../src/main/handlers/tests/suiteStore'
import { UNLISTED_SUITE_ID } from '../../../src/shared/types/suite'
import type { Test } from '../../../src/shared/types/test'

let project: string
let userData: string
const win = { webContents: { send: vi.fn() }, reload: vi.fn() } as never

const checkout: Test = {
  id: 't-checkout',
  name: 'Checkout',
  url: 'https://shop.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://shop.test/cart' }]
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-suite-store-'))
  userData = await mkdtemp(join(tmpdir(), 'raider-suite-store-data-'))
  mockUserData.dir = userData
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  appState.projectPath = null
  appState.suites = new Map()
  appState.mainWindow = win
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
  await rm(userData, { recursive: true, force: true })
})

describe('saveTestInSuite', () => {
  it('saves into "Not in a suite" on a project that has no such suite yet', async () => {
    await setActiveProject(project)
    const store = filesStore()!
    expect(store.index.has(UNLISTED_SUITE_ID)).toBe(false)

    const result = await saveTestInSuite(store, UNLISTED_SUITE_ID, checkout)

    expect(result).toEqual({
      success: true,
      test: expect.objectContaining({ id: 't-checkout', file: 'spec/checkout_spec.rb' })
    })
    const index = JSON.parse(await readFile(join(project, '.raider', 'suites.json'), 'utf-8'))
    expect(index.suites).toEqual([
      { id: UNLISTED_SUITE_ID, name: 'Not in a suite', testIds: ['t-checkout'] }
    ])
    const suites = await getSuites()
    expect(suites).toEqual([
      expect.objectContaining({
        id: UNLISTED_SUITE_ID,
        tests: [expect.objectContaining({ id: 't-checkout' })]
      })
    ])
  })

  it('still refuses any other suite that does not exist', async () => {
    await setActiveProject(project)

    const result = await saveTestInSuite(filesStore()!, 'nope', checkout)

    expect(result).toEqual({ success: false, error: 'Suite with ID nope not found.' })
    expect(filesStore()!.index.size).toBe(0)
  })
})
