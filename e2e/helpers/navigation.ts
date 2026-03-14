import type { Page } from '@playwright/test'

/**
 * Navigate to a page via hash router and wait for it to settle.
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  await page.evaluate((r) => {
    window.location.hash = `#${r}`
  }, route)
  await page.waitForTimeout(800)
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
    // Has suites already - open the suite dropdown button (has aria-label "Select a Suite")
    const suiteDropdownBtn = page.locator('button[aria-label="Select a Suite"]')
    if (await suiteDropdownBtn.isVisible().catch(() => false)) {
      await suiteDropdownBtn.click()
      await page.waitForTimeout(300)
      // Click "+ New Suite..." option in the dropdown
      const newSuiteOption = page.getByText('+ New Suite...')
      if (await newSuiteOption.isVisible().catch(() => false)) {
        await newSuiteOption.click()
      }
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
