import { test, expect } from './electronApp'
import { navigateTo, goToRecorder, createSuiteViaUI } from './helpers/navigation'

test.describe('Error States & Edge Cases', () => {
  test('navigating to file-editor without state does not crash', async ({ page }) => {
    await navigateTo(page, '/file-editor')
    await page.waitForTimeout(500)

    // App should still be functional - can navigate away
    await navigateTo(page, '/recorder')
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('rapid tab switching in Recorder does not break UI', async ({ page }) => {
    await goToRecorder(page)
    await page.waitForTimeout(500)

    const recordingTab = page.locator('button').filter({ hasText: 'Recording' }).first()
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    const settingsTab = page.locator('button').filter({ hasText: 'Settings' })

    for (let i = 0; i < 5; i++) {
      await recordingTab.click()
      await dashboardTab.click()
      await settingsTab.click()
    }

    await recordingTab.click()
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('navigating between all pages rapidly does not crash', async ({ page }) => {
    const routes = ['/recorder', '/start-project', '/new', '/overview']

    for (const route of routes) {
      await navigateTo(page, route)
      await page.waitForTimeout(200)
    }

    await navigateTo(page, '/recorder')
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('double-clicking nav links does not break navigation', async ({ page }) => {
    await page.locator('a[href="#/overview"]').dblclick()
    await page.waitForTimeout(800)
    // Overview page should load without crashing
    const url = page.url()
    expect(url).toContain('#/overview')
  })

  test('back button on new project page navigates away', async ({ page }) => {
    await navigateTo(page, '/start-project')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(800)

    await page.getByRole('button', { name: 'Back' }).click()
    await page.waitForTimeout(500)

    const url = page.url()
    expect(url).not.toContain('#/new')
  })
})
