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
  },
  webUtils: { getPathForFile: vi.fn() }
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
    'recordOverExample',
    'createQuickProject',
    'isQuickProject',
    'listQuickProjects',
    'listRecentProjects',
    'removeRecentProject',
    'clearRecentProjects',
    'saveQuickProjectTo',
    'selectFolder',
    'readDirectory',
    'readFile',
    'readImage',
    'editFile',
    'createProjectEntry',
    'copyProjectEntry',
    'duplicateProjectEntry',
    'renameProjectEntry',
    'trashProjectEntry',
    'openReport',
    'reportExists',

    // Ruby & Dependencies
    'isRubyInstalled',
    'isRbenvRubyInstalled',
    'isRvmRubyInstalled',
    'isSystemRubyInstalled',
    'installRbenvAndRuby',
    'installGems',

    // Browser Configuration
    'updateBrowserUrl',
    'updateBrowserType',

    // Test Execution
    'runCommand',
    'runTest',
    'prepareTestRun',

    // Step Rendering
    'renderStep',

    'getTests',
    'listProjectTests',
    'mapFailedStep',
    'openCodeTest',
    'getProjectLayout',
    'upgradeRubyRaider',
    'exportProject',
    'importProject',
    'importTest',
    'setTestTags',

    // Test Management
    'saveRecording',
    'deleteTest',
    'readTestFile',
    'pasteTestFile',
    'trashTest',
    'exportTest',

    // Recording Session
    'startRecordingMain',
    'replayStepsAndRecord',
    'cancelReplay',
    'replayInWebview',
    'registerRecorderWebContents',
    'stopRecordingMain',
    'setDocumentEdited',
    'setRecordingState',
    'setMenuRecording',
    'onFlushRecording',
    'flushRecordingDone',
    'loadUrlRequest',
    'updateRecordingSettings',
    'setActiveProject',
    'getRecorderSettings',
    'setPickMode',
    'onRecorderPicked',

    // Trace Management
    'saveTrace',
    'loadTrace',
    'deleteTrace',

    // Trace viewer (raider-trace zips)
    'openTrace',
    'readTraceEntry',
    'closeTrace',
    'onTraceOpened',
    'openDroppedTrace',

    // Menu bar
    'onMenuCommand',
    'onOpenRecentProject',

    // Results
    'acceptBaseline',

    // Main-to-renderer events (payload only, return an unsubscribe)
    'onTestsUpdated',
    'onRecordingStarted',
    'onRecordingStopped',
    'onNewRecordedStep',
    'onAddAssertionStep',
    'onNewTraceStep',
    'onReplayFailed',

    // Event Listeners

    // Scaffolding
    'scaffoldGenerate',

    // Extended Project Settings
    'updateTimeout',
    'updateViewport',
    'updateBrowserOptions',
    'updateHeadlessMode',
    'getProjectConfig',
    'openDocs',

    // Terminal
    'terminalSpawn',
    'terminalWrite',
    'terminalResize',
    'terminalKill',
    'onTerminalData',
    'onTerminalExit',

    // Longship
    'getLongshipConfig',
    'setLongshipConfig',

    // Live test runs (RunApi)
    'startRun',
    'cancelRun',
    'getActiveRun',
    'getRunDefaults',
    'onRunEvent',

    // Saved logins
    'listSavedLogins',
    'forgetSavedLogin',

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
    const api = calls.find((c) => c[0] === 'api')?.[1] ?? (globalThis as any).api
    expect(api).toBeDefined()
    for (const key of Object.keys(api)) {
      expect(typeof api[key], `${key} should be a function`).toBe('function')
    }
  })

  it('onRunEvent unsubscribes exactly its own listener and passes only the event', async () => {
    const { contextBridge, ipcRenderer } = await import('electron')
    const calls = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls
    const api = calls.find((c) => c[0] === 'api')?.[1] ?? (globalThis as any).api
    expect(api).toBeDefined()
    const on = ipcRenderer.on as ReturnType<typeof vi.fn>
    const off = ipcRenderer.removeListener as ReturnType<typeof vi.fn>
    on.mockClear()
    off.mockClear()

    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = api.onRunEvent(first)
    api.onRunEvent(second)
    const [[channelA, listenerA], [, listenerB]] = on.mock.calls
    expect(channelA).toBe('run-event')
    expect(listenerA).not.toBe(listenerB)

    const event = { type: 'run:phase', runId: 'r1', phase: 'booting' }
    listenerB({}, event)
    expect(second).toHaveBeenCalledWith(event)

    unsubscribeFirst()
    expect(off).toHaveBeenCalledTimes(1)
    expect(off).toHaveBeenCalledWith('run-event', listenerA)
  })

  it('event subscriptions pass the payload only and unsubscribe with the wrapper they registered', async () => {
    const { contextBridge, ipcRenderer } = await import('electron')
    const calls = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls
    const api = calls.find((c) => c[0] === 'api')?.[1] ?? (globalThis as any).api
    expect(api).toBeDefined()
    const on = ipcRenderer.on as ReturnType<typeof vi.fn>
    const off = ipcRenderer.removeListener as ReturnType<typeof vi.fn>
    const channels: Record<string, string> = {
      onTestsUpdated: 'tests-updated',
      onMenuCommand: 'menu-command',
      onOpenRecentProject: 'open-recent-project',
      onRecordingStarted: 'recording-started',
      onRecordingStopped: 'recording-stopped',
      onNewRecordedStep: 'new-recorded-step',
      onAddAssertionStep: 'add-assertion-step',
      onNewTraceStep: 'new-trace-step',
      onReplayFailed: 'replay-failed',
      onTerminalData: 'terminal-data',
      onTerminalExit: 'terminal-exit'
    }

    for (const [method, channel] of Object.entries(channels)) {
      on.mockClear()
      off.mockClear()
      const callback = vi.fn()
      const unsubscribe = api[method](callback)
      const [[onChannel, wrapper]] = on.mock.calls
      expect(onChannel).toBe(channel)
      expect(wrapper).not.toBe(callback)

      const event = { sender: 'raw ipcRenderer' }
      wrapper(event, { payload: method })
      expect(callback).toHaveBeenCalledWith({ payload: method })
      expect(callback.mock.calls[0]).not.toContain(event)

      unsubscribe()
      expect(off).toHaveBeenCalledTimes(1)
      expect(off).toHaveBeenCalledWith(channel, wrapper)
    }
  })

  it('openDroppedTrace keeps the path in preload and refuses a File with no path', async () => {
    const { contextBridge, ipcRenderer, webUtils } = await import('electron')
    const calls = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls
    const api = calls.find((c) => c[0] === 'api')?.[1] ?? (globalThis as any).api
    expect(api).toBeDefined()
    const invoke = ipcRenderer.invoke as ReturnType<typeof vi.fn>
    const getPath = webUtils.getPathForFile as ReturnType<typeof vi.fn>
    invoke.mockClear()

    getPath.mockReturnValueOnce('')
    expect(await api.openDroppedTrace({})).toEqual({ ok: false, error: 'notFound' })
    expect(invoke).not.toHaveBeenCalled()

    getPath.mockReturnValueOnce('/Users/qa/Downloads/trace.zip')
    invoke.mockResolvedValueOnce({ ok: false, error: 'notTrace' })
    expect(await api.openDroppedTrace({})).toEqual({ ok: false, error: 'notTrace' })
    expect(invoke).toHaveBeenCalledWith('trace-open-drop', '/Users/qa/Downloads/trace.zip')
  })
})
