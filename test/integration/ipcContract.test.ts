/**
 * IPC Contract Test
 *
 * Validates that the preload API (what the renderer actually gets)
 * exposes all the methods defined in the WindowApi TypeScript interface.
 * This catches type drift where the interface and implementation diverge.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock electron so preload/index.ts can be imported
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn()
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {}
}))

describe('IPC Contract', () => {
  let preloadApiKeys: string[]

  beforeAll(async () => {
    // Import the preload module to get the actual API object
    const { contextBridge } = await import('electron')
    await import('../../src/preload/index')

    // contextBridge.exposeInMainWorld is called with ('api', apiObject)
    const calls = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls
    const apiCall = calls.find((c) => c[0] === 'api')

    if (apiCall) {
      preloadApiKeys = Object.keys(apiCall[1])
    } else {
      // If context isolation is off, the api was set on window directly
      preloadApiKeys = Object.keys((globalThis as Record<string, unknown>).api || {})
    }
  })

  // These are all the methods that should exist on the preload API
  // based on the WindowApi interface in window.ts
  const expectedMethods = [
    // Project Management
    'runRubyRaider',
    'selectFolder',
    'readDirectory',
    'readFile',
    'readImage',
    'editFile',
    'deleteFile',
    'renameFile',
    'duplicateFile',
    'openAllure',

    // Ruby & Dependencies
    'isRubyInstalled',
    'isRbenvRubyInstalled',
    'isRvmRubyInstalled',
    'isSystemRubyInstalled',
    'installRbenvAndRuby',
    'installRaider',
    'installGems',

    // Browser & Mobile Configuration
    'updateBrowserUrl',
    'updateBrowserType',
    'isMobileProject',
    'updateMobileCapabilities',
    'getMobileCapabilities',

    // Test Execution
    'runCommand',
    'runRaiderTests',
    'runRakeTask',
    'rerunFailedTests',
    'runTest',
    'runSuite',

    // Command Parsing
    'xpathParser',
    'commandParser',

    // Suite Management
    'getSuites',
    'createSuite',
    'deleteSuite',
    'exportSuite',
    'exportProject',
    'importProject',
    'importSuite',
    'importTest',

    // Test Management
    'saveRecording',
    'deleteTest',
    'exportTest',

    // Recording Session
    'startRecordingMain',
    'replayStepsAndRecord',
    'cancelReplay',
    'replayInWebview',
    'registerRecorderWebContents',
    'stopRecordingMain',
    'loadUrlRequest',
    'updateRecordingSettings',

    // Trace Management
    'saveTrace',
    'loadTrace',
    'deleteTrace',

    // Event Listeners
    'onTestRunStatus',
    'removeTestRunStatusListener',

    // Scaffolding
    'scaffoldGenerate',

    // Extended Project Settings
    'updateTimeout',
    'updateViewport',
    'updateDebugMode',
    'updateBrowserOptions',
    'updateHeadlessMode',
    'getProjectConfig',
    'startAppium',

    // Path Configuration
    'updatePaths',

    // Terminal
    'terminalSpawn',
    'terminalWrite',
    'terminalResize',
    'terminalKill',
    'onTerminalData',
    'removeTerminalDataListener',
    'onTerminalExit',
    'removeTerminalExitListener',

    // Longship
    'getLongshipConfig',
    'setLongshipConfig',

    // App Lifecycle
    'closeApp'
  ]

  it('preload API exposes all expected methods', () => {
    for (const method of expectedMethods) {
      expect(preloadApiKeys, `Missing method: ${method}`).toContain(method)
    }
  })

  it('preload API does not expose unexpected methods', () => {
    const unexpected = preloadApiKeys.filter((key) => !expectedMethods.includes(key))
    expect(
      unexpected,
      `Unexpected methods found in preload API: ${unexpected.join(', ')}. ` +
        'Add them to the WindowApi interface in window.ts and to this test.'
    ).toEqual([])
  })

  it('all preload API values are functions', async () => {
    const { contextBridge } = await import('electron')
    const calls = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls
    const apiCall = calls.find((c) => c[0] === 'api')
    if (!apiCall) return

    const api = apiCall[1]
    for (const key of Object.keys(api)) {
      expect(typeof api[key], `${key} should be a function`).toBe('function')
    }
  })
})
