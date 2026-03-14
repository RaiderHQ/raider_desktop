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
export async function mockIPCMultiple(
  page: Page,
  mocks: Record<string, unknown>
): Promise<void> {
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
export async function mockIPCError(page: Page, method: string, errorMessage: string): Promise<void> {
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
 * Mock adoptAnalyze with a successful detection result.
 */
export async function mockAdoptAnalyze(
  page: Page,
  detection: Record<string, unknown>
): Promise<void> {
  await mockIPC(page, 'adoptAnalyze', { success: true, detection })
}

/**
 * Mock readDirectory to return a file tree.
 */
export async function mockReadDirectory(
  page: Page,
  tree: unknown[]
): Promise<void> {
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
export async function mockLlmStatus(
  page: Page,
  config: Record<string, unknown>
): Promise<void> {
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
  await mockIPCSync(page, 'onTestRunStatus')
  await mockIPCSync(page, 'removeTestRunStatusListener')

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
