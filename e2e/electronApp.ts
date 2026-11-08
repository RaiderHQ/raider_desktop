import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
}

/**
 * Find the main app window (not DevTools).
 * DevTools windows have titles like "DevTools" and URLs starting with "devtools://".
 */
async function getMainWindow(app: ElectronApplication): Promise<Page> {
  // Wait for at least one window
  await app.firstWindow()

  // The DevTools window can open first and briefly report about:blank before its
  // devtools:// URL, so poll until a window is showing the app itself.
  const isAppWindow = (win: Page): boolean => /^(file|https?):/.test(win.url())
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const mainWindow = app.windows().find(isAppWindow)
    if (mainWindow) return mainWindow
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `No app window found; windows: ${app
      .windows()
      .map((w) => w.url())
      .join(', ')}`
  )
}

/**
 * Custom Playwright fixture that launches the Electron app before each test
 * and closes it after. Every test gets a fresh app instance.
 */
export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const mainPath = path.resolve(__dirname, '../out/main/index.js')
    // Each test gets its own userData: recent projects, quick recordings and traces it writes
    // must not land in the profile of the app someone is using on this machine
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-e2e-'))
    const app = await _electron.launch({
      args: [mainPath, `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })
    await use(app)
    // A test may leave an unsaved edit; destroy() skips the close guard's dialog, which would block quitting
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => undefined)
    await app.close()
    fs.rmSync(userData, { recursive: true, force: true })
  },
  page: async ({ electronApp }, use) => {
    const window = await getMainWindow(electronApp)
    await window.waitForLoadState('domcontentloaded')
    // Give the React app time to mount and i18n to initialize
    await window.waitForTimeout(2000)
    await use(window)
  }
})

export { expect } from '@playwright/test'
