import type { Page, ElectronApplication } from '@playwright/test'

/**
 * Mock a single window.api method with a static return value.
 * Must be called BEFORE navigating to a page that calls that method on mount.
 */
export async function mockIPC(page: Page, method: string, returnValue: unknown): Promise<void> {
  await page.evaluate(
    ([m, v]) => {
      ;(window as any).api[m] = async () => JSON.parse(v)
    },
    [method, JSON.stringify(returnValue)]
  )
}

/**
 * Mock multiple window.api methods at once.
 */
export async function mockIPCMultiple(page: Page, mocks: Record<string, unknown>): Promise<void> {
  await page.evaluate((mocksJson) => {
    const parsed = JSON.parse(mocksJson) as Record<string, unknown>
    for (const [method, value] of Object.entries(parsed)) {
      ;(window as any).api[method] = async () => value
    }
  }, JSON.stringify(mocks))
}

/**
 * Mock a window.api method to throw an error.
 */
export async function mockIPCError(
  page: Page,
  method: string,
  errorMessage: string
): Promise<void> {
  await page.evaluate(
    ([m, msg]) => {
      ;(window as any).api[m] = async () => {
        throw new Error(msg)
      }
    },
    [method, errorMessage]
  )
}

/**
 * Mock a window.api method with a synchronous return (for non-async methods like event listeners).
 */
export async function mockIPCSync(page: Page, method: string): Promise<void> {
  await page.evaluate((m) => {
    ;(window as any).api[m] = () => {}
  }, method)
}

/**
 * Mock selectFolder to return a specific path.
 */
export async function mockSelectFolder(page: Page, folderPath: string | null): Promise<void> {
  await mockIPC(page, 'selectFolder', folderPath)
}

/**
 * Mock isRubyInstalled to return a successful result.
 */
export async function mockRubyInstalled(page: Page): Promise<void> {
  await mockIPC(page, 'isRubyInstalled', {
    success: true,
    rubyVersion: '3.2.0',
    rubyCommand: 'ruby',
    missingGems: []
  })
}

/**
 * Mock isRubyInstalled to return missing ruby.
 */
export async function mockRubyMissing(page: Page): Promise<void> {
  await mockIPC(page, 'isRubyInstalled', {
    success: false,
    error: 'Ruby not found'
  })
}

/**
 * Mock isRubyInstalled to return missing gems.
 */
export async function mockGemsMissing(page: Page, gems: string[]): Promise<void> {
  await mockIPC(page, 'isRubyInstalled', {
    success: true,
    rubyVersion: '3.2.0',
    rubyCommand: 'ruby',
    missingGems: gems
  })
}

/**
 * Mock getSuites to return a set of test suites.
 */
export async function mockSuites(
  page: Page,
  suites: Array<{ id: string; name: string; tests: unknown[] }>
): Promise<void> {
  await mockIPC(page, 'getSuites', suites)
}

/**
 * Mock readDirectory to return a file tree.
 */
export async function mockReadDirectory(page: Page, tree: unknown[]): Promise<void> {
  await mockIPC(page, 'readDirectory', tree)
}

/**
 * Mock isRubyInstalled to return a successful result with a version warning.
 */
export async function mockRubyInstalledWithWarning(
  page: Page,
  version: string,
  warning: string
): Promise<void> {
  await mockIPC(page, 'isRubyInstalled', {
    success: true,
    rubyVersion: version,
    rubyCommand: 'ruby',
    missingGems: [],
    versionWarning: warning
  })
}

/**
 * Mock getLlmStatus with a config result.
 */
export async function mockLlmStatus(page: Page, config: Record<string, unknown>): Promise<void> {
  await mockIPC(page, 'getLlmStatus', { success: true, ...config })
}

/**
 * Mock pluginManager list operation.
 */
export async function mockPluginManager(
  page: Page,
  plugins: Array<{ name: string; installed: boolean; description?: string }>
): Promise<void> {
  await mockIPC(page, 'pluginManager', { success: true, plugins })
}

// ─── New infrastructure helpers ────────────────────────────

/**
 * Mock an IPC method AND capture all call args for later verification.
 * Works by replacing `window.api[method]` with a spy that records args.
 */
export async function mockIPCCapture(
  page: Page,
  method: string,
  returnValue: unknown
): Promise<void> {
  await page.evaluate(
    ([m, v]) => {
      const w = window as any
      if (!w.__IPC_CALLS__) w.__IPC_CALLS__ = {}
      w.__IPC_CALLS__[m] = []
      w.api[m] = async (...args: unknown[]) => {
        w.__IPC_CALLS__[m].push(args)
        return JSON.parse(v)
      }
    },
    [method, JSON.stringify(returnValue)]
  )
}

/**
 * Mock an IPC method to capture calls AND throw an error.
 */
export async function mockIPCCaptureError(
  page: Page,
  method: string,
  errorMessage: string
): Promise<void> {
  await page.evaluate(
    ([m, msg]) => {
      const w = window as any
      if (!w.__IPC_CALLS__) w.__IPC_CALLS__ = {}
      w.__IPC_CALLS__[m] = []
      w.api[m] = async (...args: unknown[]) => {
        w.__IPC_CALLS__[m].push(args)
        throw new Error(msg)
      }
    },
    [method, errorMessage]
  )
}

/**
 * Mock an IPC method to capture calls AND return a failure result (not throw).
 */
export async function mockIPCCaptureFailure(
  page: Page,
  method: string,
  error?: string
): Promise<void> {
  await page.evaluate(
    ([m, err]) => {
      const w = window as any
      if (!w.__IPC_CALLS__) w.__IPC_CALLS__ = {}
      w.__IPC_CALLS__[m] = []
      w.api[m] = async (...args: unknown[]) => {
        w.__IPC_CALLS__[m].push(args)
        return { success: false, error: err || 'Mock failure' }
      }
    },
    [method, error || 'Mock failure']
  )
}

/**
 * Get all captured IPC call args for a given method.
 */
export async function getIPCCalls(page: Page, method: string): Promise<unknown[][]> {
  return page.evaluate((m) => {
    const w = window as any
    return w.__IPC_CALLS__?.[m] || []
  }, method)
}

/**
 * Set project path in the projectStore via __TEST_STORES__.
 */
export async function setProjectPath(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    const stores = (window as any).__TEST_STORES__
    if (stores?.projectStore) {
      stores.projectStore.setState({ projectPath: p })
    }
  }, path)
}

/**
 * Set ruby command in the rubyStore via __TEST_STORES__.
 */
export async function setRubyCommand(page: Page, command: string): Promise<void> {
  await page.evaluate((cmd) => {
    const stores = (window as any).__TEST_STORES__
    if (stores?.rubyStore) {
      stores.rubyStore.setState({ rubyCommand: cmd })
    }
  }, command)
}

/**
 * Convenience: set up a full project context for testing.
 * Sets project path, ruby command, and mocks common IPC methods.
 */
export async function setupProjectContext(
  page: Page,
  opts?: {
    projectPath?: string
    rubyCommand?: string
    isMobile?: boolean
    files?: unknown[]
    tests?: unknown[]
  }
): Promise<void> {
  const projectPath = opts?.projectPath || '/mock/test-project'
  const rubyCommand = opts?.rubyCommand || 'ruby'

  // Mock IPC methods that fire on mount
  await mockIPC(page, 'isMobileProject', {
    success: true,
    isMobileProject: opts?.isMobile || false
  })
  await mockIPC(page, 'readDirectory', opts?.files || [])
  // The Overview opens on the Tests tab, which lists the project's spec files
  await mockIPC(page, 'listProjectTests', opts?.tests || [])

  // Run settings persist per project; start on the serial defaults
  await page.evaluate((p) => localStorage.removeItem(`raider.runSettings:${p}`), projectPath)

  // Set store state
  await setProjectPath(page, projectPath)
  await setRubyCommand(page, rubyCommand)
}

/**
 * Mock an IPC handler at the main process level via electronApp.evaluate.
 * Captures args in a global for later retrieval.
 */
export async function mockMainIPCCapture(
  electronApp: ElectronApplication,
  channel: string,
  returnValue: unknown
): Promise<void> {
  await electronApp.evaluate(
    async ({ ipcMain }, { ch, val }) => {
      const g = global as any
      if (!g.__IPC_CAPTURE__) g.__IPC_CAPTURE__ = {}
      g.__IPC_CAPTURE__[ch] = []
      ipcMain.removeHandler(ch)
      ipcMain.handle(ch, async (_event, ...args) => {
        g.__IPC_CAPTURE__[ch].push(args)
        return JSON.parse(val)
      })
    },
    { ch: channel, val: JSON.stringify(returnValue) }
  )
}

/**
 * Get captured IPC call args from the main process.
 */
export async function getMainIPCCalls(
  electronApp: ElectronApplication,
  channel: string
): Promise<unknown[][]> {
  return electronApp.evaluate(async ({}, ch) => {
    const g = global as any
    return g.__IPC_CAPTURE__?.[ch] || []
  }, channel)
}

// ─── Project tests (recorded files and hand-written specs) ──

/**
 * Mock listProjectTests: the Tests tab listing of the project's spec files.
 */
export async function mockProjectTests(
  page: Page,
  entries: Array<{
    file: string
    name: string
    ownership: 'recorded' | 'codeOwnedWasRecorded' | 'code'
    testId?: string
    missingFile?: true
  }>
): Promise<void> {
  await mockIPC(page, 'listProjectTests', entries)
}

/**
 * Mock getProjectLayout with what activation detected for the project.
 */
export async function mockProjectLayout(
  page: Page,
  layout: Record<string, unknown> | null
): Promise<void> {
  await mockIPC(page, 'getProjectLayout', layout)
}

/**
 * Give the open project a layout, once its activation has set the real one
 * (the mocked project folder has no Gemfile, so activation finds it can't record).
 */
export async function setProjectLayout(page: Page, layout: Record<string, unknown>): Promise<void> {
  await page.waitForFunction(() => {
    const stores = (window as unknown as TestStoresWindow).__TEST_STORES__
    return stores?.projectStore?.getState().layout !== null
  })
  await page.evaluate((l) => {
    ;(window as unknown as TestStoresWindow).__TEST_STORES__.projectStore.setState({ layout: l })
  }, layout)
}

type Patchable = Record<string, unknown>
interface TestStoresWindow {
  __TEST_STORES__: {
    projectStore: {
      getState: () => { layout: unknown }
      setState: (state: Patchable) => void
    }
  }
}

/**
 * Send an event from the main process to the window, e.g. 'tests-migrated'
 * or 'suites-too-new', as project activation does.
 */
export async function sendMainEvent(
  electronApp: ElectronApplication,
  channel: string,
  payload?: unknown
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, { ch, body }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (body === undefined) win.webContents.send(ch)
        else win.webContents.send(ch, JSON.parse(body))
      }
    },
    { ch: channel, body: payload === undefined ? undefined : JSON.stringify(payload) }
  )
}
