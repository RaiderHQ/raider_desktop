import { expect } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'

/**
 * Navigate to a page via hash router and wait for it to settle.
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  await page.evaluate((r) => {
    window.location.hash = `#${r}`
  }, route)
  await page.waitForTimeout(800)
}

/**
 * The "Open" button of the open-project card on the Welcome page, anchored on
 * this card's heading (the button is the heading's sibling).
 */
export function openProjectButton(page: Page): Locator {
  return page
    .getByRole('heading', { name: 'Open existing project' })
    .locator('xpath=following-sibling::button')
}

/**
 * Make the app's startup Ruby check succeed regardless of the host's Ruby setup.
 * Without it a host missing a gem shows a "Missing Gems" modal that swallows
 * every click. The check runs once at startup, before a test can install a mock,
 * so mock it in the main process and reload to re-run it.
 */
export async function mockRubyReady(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(async ({ ipcMain }) => {
    ipcMain.removeHandler('is-ruby-installed')
    ipcMain.handle('is-ruby-installed', async () => ({
      success: true,
      rubyVersion: '3.2.0',
      rubyCommand: 'ruby',
      missingGems: []
    }))
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)
}

/**
 * Get from the Welcome page (the app's start screen) into the main layout.
 * Mocks the folder picker in the main process (window.api is frozen by the
 * contextBridge, so a renderer-side mock would not take effect and the native
 * dialog would open), clicks "Open" on the Welcome page and waits for the
 * Overview route, after which the header nav (Recorder link) is available.
 */
export async function enterMainLayout(
  electronApp: ElectronApplication,
  page: Page,
  projectPath = '/mock/test-project'
): Promise<void> {
  await electronApp.evaluate(async ({ ipcMain }, folder) => {
    ipcMain.removeHandler('select-folder')
    ipcMain.handle('select-folder', async () => folder)
  }, projectPath)
  await openProjectButton(page).click()
  await expect(page).toHaveURL(/#\/overview/)
  await page.waitForTimeout(500)
}

export async function goToLanding(page: Page): Promise<void> {
  await navigateTo(page, '/start-project')
}

export async function goToNewProject(page: Page): Promise<void> {
  await navigateTo(page, '/new')
}

/**
 * The route of a test on the Tests tab. `key` is `id:<testId>` or `file:<relpath>`,
 * sent as base64url (as the app's toRouteParam does).
 */
export const testRoute = (key: string): string =>
  `/overview/tests/${Buffer.from(key, 'utf-8').toString('base64url')}`

/** Open a test on the Tests tab by its key (`id:<testId>` or `file:<relpath>`). */
export async function goToTest(page: Page, key: string): Promise<void> {
  await navigateTo(page, testRoute(key))
}

/** Open the new-test form on the Tests tab. */
export async function goToNewTest(page: Page): Promise<void> {
  await navigateTo(page, '/overview/tests/new')
}

export async function goToOverview(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
}

/**
 * Navigate to Overview page and click the Files tab (the Overview opens on Tests).
 */
export async function goToOverviewFiles(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await page.waitForTimeout(300)
}

export async function goToFileEditor(page: Page): Promise<void> {
  await navigateTo(page, '/file-editor')
}

/**
 * Navigate to Overview page and click the Settings tab.
 * Uses button locator to avoid matching the nav link "Settings".
 */
export async function goToOverviewSettings(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
  await page.waitForTimeout(500)
  // The overview tabs are <button> elements, nav links are <a> elements
  const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
  if (await settingsTab.isVisible().catch(() => false)) {
    await settingsTab.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Navigate to Overview page and click the Scaffolding tab.
 */
export async function goToOverviewScaffold(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
  await page.waitForTimeout(500)
  const scaffoldTab = page.getByText('Scaffolding', { exact: true }).first()
  if (await scaffoldTab.isVisible().catch(() => false)) {
    await scaffoldTab.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Navigate to Overview page and click the Dashboard tab.
 */
export async function goToOverviewDashboard(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
  await page.waitForTimeout(500)
  const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
  if (await dashboardTab.isVisible().catch(() => false)) {
    await dashboardTab.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Click a nav link by its href route.
 */
export async function clickNavLink(page: Page, route: string): Promise<void> {
  await page.locator(`a[href="#${route}"]`).click()
  await page.waitForTimeout(800)
}

/**
 * Create a test suite from the Tests list's suite actions menu (on the Tests tab).
 */
export async function createSuiteViaUI(page: Page, suiteName: string): Promise<void> {
  await page.getByRole('button', { name: 'Suite actions' }).click()
  await page.getByRole('menuitem', { name: 'New suite' }).click()
  await page.getByRole('textbox', { name: 'New suite' }).fill(suiteName)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
}
