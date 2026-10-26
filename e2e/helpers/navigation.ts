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
 * The "Open" button of the open-project card on the Welcome page. The recorder
 * card also has a button named "Open", so anchor on this card's heading; the
 * button is the heading's sibling (the recorder button is wrapped in a Link).
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

export async function goToRecorder(page: Page): Promise<void> {
  await navigateTo(page, '/recorder')
}

export async function goToOverview(page: Page): Promise<void> {
  await navigateTo(page, '/overview')
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
 * Navigate to Recorder page and click the Settings tab.
 */
export async function goToRecorderSettings(page: Page): Promise<void> {
  await navigateTo(page, '/recorder')
  await page.waitForTimeout(500)
  const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
  if (await settingsTab.isVisible().catch(() => false)) {
    await settingsTab.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Navigate to Recorder page and click the Dashboard tab.
 */
export async function goToRecorderDashboard(page: Page): Promise<void> {
  await navigateTo(page, '/recorder')
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
 * Create a test suite via the UI.
 * Handles both empty state ("Create Suite") and populated state (dropdown with "+ New Suite...").
 */
export async function createSuiteViaUI(page: Page, suiteName: string): Promise<void> {
  // Check for empty state "Create Suite" button
  const createSuiteBtn = page.getByRole('button', { name: 'Create Suite' })

  if (await createSuiteBtn.isVisible().catch(() => false)) {
    // Empty state - click "Create Suite" to show input
    await createSuiteBtn.click()
  } else {
    // Has suites already - pick "+ New Suite..." in the suite <select>
    const suiteSelect = page.locator('select[aria-label="Select a Suite"]')
    if (await suiteSelect.isVisible().catch(() => false)) {
      await suiteSelect.selectOption('__new__')
    }
  }

  await page.waitForTimeout(300)

  // Fill in the suite name
  const input = page.getByPlaceholder('New suite name...')
  await input.fill(suiteName)

  // Click the "Create" confirmation button
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForTimeout(1000)
}
