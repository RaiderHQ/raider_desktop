import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { mockMode, mockRunRecording } = vi.hoisted(() => ({
  mockMode: vi.fn(),
  mockRunRecording: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => '/' }, BrowserWindow: class {} }))
vi.mock('../../../src/main/handlers/project/setActiveProject', () => ({
  activationSettled: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../../src/main/handlers/tests/recordedStore', () => ({
  filesStore: (): unknown => (mockMode() === 'files' ? {} : null),
  PROJECT_CHANGED_ERROR: 'The project was closed before this change could be saved.'
}))
vi.mock('../../../src/main/handlers/testing/runRecording', () => ({ default: mockRunRecording }))

import { appState } from '../../../src/main/handlers/appState'
import { runTestHandler } from '../../../src/main/handlers/testing/runProjectTests'
import type { Test } from '../../../src/shared/types/test'

const test1: Test = { id: 't1', name: 'Login', url: 'https://x.test', steps: [] }
const live = { success: false, output: 'Use the live runner.' }

beforeEach(() => {
  vi.clearAllMocks()
  appState.tests = new Map([['t1', test1]])
  appState.projectAutomation = 'selenium'
  appState.projectFramework = 'rspec'
  appState.projectPath = '/p'
  appState.layout = null
  mockRunRecording.mockResolvedValue({ success: true, output: 'rec' })
})

describe('run-test', () => {
  it('points to the live runner in a files-mode project', async () => {
    mockMode.mockReturnValue('files')
    expect(await runTestHandler('t1', '/p', 'ruby')).toEqual(live)
    expect(mockRunRecording).not.toHaveBeenCalled()
  })

  it('run-test runs the cached test through runRecording in a project that is not on files', async () => {
    mockMode.mockReturnValue('locked')
    const { implicitWait, explicitWait, testIdAttribute, browser, headless } =
      appState.recorderSettings

    expect(await runTestHandler('t1', '/p', 'ruby')).toEqual({ success: true, output: 'rec' })

    expect(mockRunRecording).toHaveBeenCalledWith({
      savedTest: test1,
      implicitWait,
      explicitWait,
      testIdAttribute,
      browser,
      headless,
      projectPath: '/p',
      rubyCommand: 'ruby',
      projectAutomation: 'selenium',
      projectFramework: 'rspec'
    })
  })

  it('run-test reports an unknown test in a project that is not on files', async () => {
    mockMode.mockReturnValue('locked')
    expect(await runTestHandler('nope', '/p', 'ruby')).toEqual({
      success: false,
      output: 'Test with ID nope not found.'
    })
    expect(mockRunRecording).not.toHaveBeenCalled()
  })
})

describe('run-test, project checks', () => {
  it('refuses a run asked for another project', async () => {
    mockMode.mockReturnValue('locked')
    expect(await runTestHandler('t1', '/other', 'ruby')).toEqual({
      success: false,
      output: 'The project was closed before this change could be saved.'
    })
    expect(mockRunRecording).not.toHaveBeenCalled()
  })

  it('has no test to run without an active project', async () => {
    mockMode.mockReturnValue('locked')
    appState.projectPath = null
    expect(await runTestHandler('t1', '/p', 'ruby')).toEqual({
      success: false,
      output: 'Test with ID t1 not found.'
    })
  })
})

describe('run-test, mobile projects', () => {
  const refused = {
    success: false,
    output: "Mobile projects can't run recorded tests yet.",
    code: 'mobileNoLegacy'
  }
  let dir: string

  beforeEach(() => {
    mockMode.mockReturnValue('locked')
    dir = mkdtempSync(join(tmpdir(), 'raider-mobile-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('never runs generated code for an Appium project', async () => {
    appState.layout = {
      framework: 'rspec',
      automation: 'appium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      recordable: false,
      unsupportedReason: 'mobile'
    }
    appState.projectAutomation = 'appium'
    expect(await runTestHandler('t1', '/p', 'ruby')).toEqual(refused)
    expect(mockRunRecording).not.toHaveBeenCalled()
  })

  it('refuses a project with appium_lib in its Gemfile while the layout is unknown', async () => {
    writeFileSync(join(dir, 'Gemfile'), "gem 'appium_lib'\ngem 'rspec'\n")
    appState.projectPath = dir
    expect(await runTestHandler('t1', dir, 'ruby')).toEqual(refused)
    expect(mockRunRecording).not.toHaveBeenCalled()
  })

  it('still runs a web project while the layout is unknown', async () => {
    writeFileSync(join(dir, 'Gemfile'), "gem 'selenium-webdriver'\ngem 'rspec'\n")
    appState.projectPath = dir
    expect(await runTestHandler('t1', dir, 'ruby')).toEqual({ success: true, output: 'rec' })
  })
})
