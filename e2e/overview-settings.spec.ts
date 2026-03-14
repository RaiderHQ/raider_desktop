import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import { setupProjectContext, mockIPCCapture, getIPCCalls } from './helpers/ipc-mock'

test.describe('Overview Settings Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
  })

  test('base URL input is visible on Overview Files tab', async ({ page }) => {
    const urlInput = page.locator('[data-testid="overview-url-input"]')
    await expect(urlInput).toBeVisible()
  })

  test('base URL saves on blur and triggers updateBrowserUrl with correct args', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserUrl', { success: true })
    const urlInput = page.locator('[data-testid="overview-url-input"]')
    await urlInput.fill('https://example.com')
    await urlInput.blur()
    await page.waitForTimeout(1000)

    const calls = await getIPCCalls(page, 'updateBrowserUrl')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe('https://example.com')

    // Toast should appear
    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('browser dropdown triggers updateBrowserType with firefox', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserType', { success: true })
    const browserSelect = page.locator('[data-testid="overview-browser-select"]')
    await expect(browserSelect).toBeVisible()
    await browserSelect.selectOption('firefox')
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserType')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe('firefox')

    // Toast should appear
    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('headless toggle is visible and can be toggled', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserOptions', { success: true })
    const headlessSwitch = page.locator('[role="switch"]').last()
    await expect(headlessSwitch).toBeVisible()
    await headlessSwitch.click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserOptions')
    expect(calls.length).toBeGreaterThanOrEqual(1)

    // Toast should appear
    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })
})
