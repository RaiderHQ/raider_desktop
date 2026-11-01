import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { mockMode, mockRunRecording, mockRunSuite } = vi.hoisted(() => ({
  mockMode: vi.fn(),
  mockRunRecording: vi.fn(),
  mockRunSuite: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => '/' }, BrowserWindow: class {} }))
vi.mock('../../../src/main/handlers/tests/suiteStore', () => ({ activeSuiteMode: mockMode }))
vi.mock('../../../src/main/handlers/testing/runRecording', () => ({ default: mockRunRecording }))
vi.mock('../../../src/main/handlers/testing/runSuite', () => ({ default: mockRunSuite }))

import { appState } from '../../../src/main/handlers/appState'
import { runSuiteHandler, runTestHandler } from '../../../src/main/handlers/testing/runProjectTests'
import type { Test } from '../../../src/shared/types/test'

const test1: Test = { id: 't1', name: 'Login', url: 'https://x.test', steps: [] }
const live = { success: false, output: 'Use the live runner.' }

beforeEach(() => {
  vi.clearAllMocks()
  appState.suites = new Map([['s1', { id: 's1', name: 'Smoke', tests: [test1] }]])
  appState.projectAutomation = 'selenium'
  appState.projectFramework = 'rspec'
  appState.projectPath = '/p'
  appState.layout = null
  mockRunRecording.mockResolvedValue({ success: true, output: 'rec' })
  mockRunSuite.mockResolvedValue({ success: true, output: 'suite' })
})

describe('run-test / run-suite', () => {
  it('both point to the live runner in a files-mode project', async () => {
    mockMode.mockResolvedValue('files')
    expect(await runTestHandler('s1', 't1', '/p', 'ruby')).toEqual(live)
    expect(await runSuiteHandler('s1', '/p', 'ruby')).toEqual(live)
    expect(mockRunRecording).not.toHaveBeenCalled()
    expect(mockRunSuite).not.toHaveBeenCalled()
  })

  it('run-test runs the cached test through runRecording in a legacy project', async () => {
    mockMode.mockResolvedValue('legacy')
    const { implicitWait, explicitWait, browser, headless } = appState.recorderSettings

    expect(await runTestHandler('s1', 't1', '/p', 'ruby')).toEqual({ success: true, output: 'rec' })

    expect(mockRunRecording).toHaveBeenCalledWith({
      savedTest: test1,
      implicitWait,
      explicitWait,
      browser,
      headless,
      projectPath: '/p',
      rubyCommand: 'ruby',
      projectAutomation: 'selenium',
      projectFramework: 'rspec'
    })
  })

  it('run-test reports an unknown test in a legacy project', async () => {
    mockMode.mockResolvedValue('legacy')
    expect(await runTestHandler('s1', 'nope', '/p', 'ruby')).toEqual({
      success: false,
      output: 'Test with ID nope not found.'
    })
    expect(mockRunRecording).not.toHaveBeenCalled()
  })

  it('run-suite runs the suite through runSuite in a legacy project', async () => {
    mockMode.mockResolvedValue('legacy')
    expect(await runSuiteHandler('s1', '/p', 'ruby')).toEqual({ success: true, output: 'suite' })
    expect(mockRunSuite).toHaveBeenCalledWith('s1', 'ruby')
  })
})

describe('run-test / run-suite, mobile projects', () => {
  const refused = {
    success: false,
    output: "Mobile projects can't run recorded tests yet.",
    code: 'mobileNoLegacy'
  }
  let dir: string

  beforeEach(() => {
    mockMode.mockResolvedValue('legacy')
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
    expect(await runTestHandler('s1', 't1', '/p', 'ruby')).toEqual(refused)
    expect(await runSuiteHandler('s1', '/p', 'ruby')).toEqual(refused)
    expect(mockRunRecording).not.toHaveBeenCalled()
    expect(mockRunSuite).not.toHaveBeenCalled()
  })

  it('refuses a project with appium_lib in its Gemfile while the layout is unknown', async () => {
    writeFileSync(join(dir, 'Gemfile'), "gem 'appium_lib'\ngem 'rspec'\n")
    appState.projectPath = dir
    expect(await runTestHandler('s1', 't1', dir, 'ruby')).toEqual(refused)
    expect(await runSuiteHandler('s1', dir, 'ruby')).toEqual(refused)
    expect(mockRunRecording).not.toHaveBeenCalled()
    expect(mockRunSuite).not.toHaveBeenCalled()
  })

  it('still runs a web project while the layout is unknown', async () => {
    writeFileSync(join(dir, 'Gemfile'), "gem 'selenium-webdriver'\ngem 'rspec'\n")
    appState.projectPath = dir
    expect(await runTestHandler('s1', 't1', dir, 'ruby')).toEqual({ success: true, output: 'rec' })
    expect(await runSuiteHandler('s1', dir, 'ruby')).toEqual({ success: true, output: 'suite' })
  })
})
