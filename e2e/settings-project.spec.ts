import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'

test.describe('Project Settings', () => {
  test('Project settings accessible via Overview > Settings tab', async ({ page }) => {
    await setupProjectContext(page)
    await page.waitForTimeout(500)
    await goToOverview(page)

    // Verify we're on overview
    expect(page.url()).toContain('#/overview')

    // Click the Settings tab on Overview
    const overviewSettingsTab = page.locator('button').filter({ hasText: 'Settings' })
    await expect(overviewSettingsTab).toBeVisible({ timeout: 5000 })
    await overviewSettingsTab.click()
    await page.waitForTimeout(3000)

    // The settings tab should show sections like Timeout, Viewport, etc.
    const bodyText = await page.locator('body').textContent()
    const hasSettingsContent =
      bodyText?.includes('Timeout') ||
      bodyText?.includes('Viewport') ||
      bodyText?.includes('Debug') ||
      bodyText?.includes('Loading') ||
      bodyText?.includes('Base Url') ||
      bodyText?.includes('Browser')

    expect(hasSettingsContent).toBeTruthy()
  })
})
