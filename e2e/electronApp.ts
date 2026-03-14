import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron } from 'playwright'
import path from 'path'

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
  let mainWindow = await app.firstWindow()

  // Check if this is the DevTools window
  const url = mainWindow.url()
  if (url.includes('devtools://')) {
    // Wait for the actual app window to appear
    mainWindow = await new Promise<Page>((resolve) => {
      const check = () => {
        for (const win of app.windows()) {
          if (!win.url().includes('devtools://')) {
            resolve(win)
            return
          }
        }
      }
      // Check existing windows first
      check()
      // Listen for new windows
      app.on('window', () => {
        check()
      })
    })
  }

  return mainWindow
}

/**
 * Custom Playwright fixture that launches the Electron app before each test
 * and closes it after. Every test gets a fresh app instance.
 */
export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const mainPath = path.resolve(__dirname, '../out/main/index.js')
    const app = await _electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })
    await use(app)
    await app.close()
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
