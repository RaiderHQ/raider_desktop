import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron } from 'playwright'
import path from 'path'

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
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
    const window = await electronApp.firstWindow()
    // Wait for the renderer to fully load
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  }
})

export { expect } from '@playwright/test'
