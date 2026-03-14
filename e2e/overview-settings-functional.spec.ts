import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPCCapture,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

test.describe('Overview Settings Tab - Functional', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    // Click Settings tab
    // Use button locator to avoid matching the nav link "Settings"
    const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
    await settingsTab.click()
    await page.waitForTimeout(500)
  })

  // ── URL & Browser ───────────────────────────────

  test('URL save triggers updateBrowserUrl with correct args', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserUrl', { success: true })
    // The URL input in the settings tab (inside the details section)
    const urlInput = page.locator('details input[type="text"]').first()
    await urlInput.fill('https://example.com')
    // Click the save/update button next to URL
    const updateBtn = page.locator('details').first().getByText('Update', { exact: false }).first()
    await updateBtn.click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserUrl')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe('https://example.com')
  })

  test('URL persists to localStorage', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserUrl', { success: true })
    const urlInput = page.locator('details input[type="text"]').first()
    await urlInput.fill('https://saved-url.com')
    const updateBtn = page.locator('details').first().getByText('Update', { exact: false }).first()
    await updateBtn.click()
    await page.waitForTimeout(500)

    const stored = await page.evaluate(() => localStorage.getItem('browserUrl'))
    expect(stored).toBe('https://saved-url.com')
  })

  test('URL restored from localStorage on remount', async ({ page }) => {
    // Set localStorage value
    await page.evaluate(() => localStorage.setItem('browserUrl', 'https://persisted.com'))
    // Navigate away and back
    await page.evaluate(() => { window.location.hash = '#/recorder' })
    await page.waitForTimeout(800)
    await page.evaluate(() => { window.location.hash = '#/overview' })
    await page.waitForTimeout(800)
    // Click Settings tab
    // Use button locator to avoid matching the nav link "Settings"
    const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
    await settingsTab.click()
    await page.waitForTimeout(500)

    const urlInput = page.locator('details input[type="text"]').first()
    await expect(urlInput).toHaveValue('https://persisted.com')
  })

  test('browser change triggers updateBrowserType', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserType', { success: true })
    const browserSelect = page.locator('details select').first()
    await browserSelect.selectOption('firefox')
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserType')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe('firefox')
  })

  test('headless toggle triggers updateBrowserOptions with --headless', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserOptions', { success: true })
    // Click the headless toggle (ToggleSwitch) inside the settings tab
    const headlessToggle = page.locator('details').first().locator('[role="switch"]')
    await headlessToggle.click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserOptions')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    // The options array should contain '--headless'
    const optionsArg = calls[0][1] as string[]
    expect(optionsArg).toContain('--headless')
  })

  // ── Timeout ─────────────────────────────────────

  test('timeout update triggers updateTimeout with value', async ({ page }) => {
    await mockIPCCapture(page, 'updateTimeout', { success: true })
    const timeoutInput = page.locator('#timeout-input')
    await timeoutInput.fill('45')
    // Click the Update button in the timeout section
    const timeoutSection = page.locator('details').filter({ has: page.locator('#timeout-input') })
    await timeoutSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateTimeout')
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe(45)
  })

  test('timeout update shows success toast', async ({ page }) => {
    await mockIPCCapture(page, 'updateTimeout', { success: true })
    const timeoutInput = page.locator('#timeout-input')
    await timeoutInput.fill('45')
    const timeoutSection = page.locator('details').filter({ has: page.locator('#timeout-input') })
    await timeoutSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  // ── Viewport ────────────────────────────────────

  test('viewport update triggers updateViewport with dimensions', async ({ page }) => {
    await mockIPCCapture(page, 'updateViewport', { success: true })
    await page.locator('#viewport-width').fill('800')
    await page.locator('#viewport-height').fill('600')
    const viewportSection = page.locator('details').filter({ has: page.locator('#viewport-width') })
    await viewportSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateViewport')
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe(800)
    expect(calls[0][2]).toBe(600)
  })

  test('Mobile preset sets 375x812', async ({ page }) => {
    await page.getByText('Mobile', { exact: true }).click()
    await expect(page.locator('#viewport-width')).toHaveValue('375')
    await expect(page.locator('#viewport-height')).toHaveValue('812')
  })

  test('Desktop preset sets 1920x1080', async ({ page }) => {
    // First change viewport to something else, then click Desktop
    await page.locator('#viewport-width').fill('800')
    await page.getByText('Desktop', { exact: true }).click()
    await expect(page.locator('#viewport-width')).toHaveValue('1920')
    await expect(page.locator('#viewport-height')).toHaveValue('1080')
  })

  test('Tablet preset sets 768x1024', async ({ page }) => {
    await page.getByText('Tablet', { exact: true }).click()
    await expect(page.locator('#viewport-width')).toHaveValue('768')
    await expect(page.locator('#viewport-height')).toHaveValue('1024')
  })

  // ── Debug ───────────────────────────────────────

  test('debug toggle triggers updateDebugMode', async ({ page }) => {
    await mockIPCCapture(page, 'updateDebugMode', { success: true })
    // Find the debug section's toggle
    const debugSection = page.locator('details').filter({ hasText: 'Debug' })
    await debugSection.locator('[role="switch"]').click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateDebugMode')
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('/mock/test-project')
    expect(calls[0][1]).toBe(true)
  })

  test('debug toggle reverts on failure', async ({ page }) => {
    await mockIPCCaptureFailure(page, 'updateDebugMode', 'Failed to update')
    const debugSection = page.locator('details').filter({ hasText: 'Debug' })
    const toggle = debugSection.locator('[role="switch"]')

    // Should be off initially
    const initialState = await toggle.getAttribute('aria-checked')
    await toggle.click()
    await page.waitForTimeout(1000)

    // Should revert back to initial state after failure
    const finalState = await toggle.getAttribute('aria-checked')
    expect(finalState).toBe(initialState)
  })

  // ── Browser Options ─────────────────────────────

  test('browser options update triggers updateBrowserOptions IPC', async ({ page }) => {
    await mockIPCCapture(page, 'updateBrowserOptions', { success: true })
    const browserOptionsSection = page.locator('details').filter({ hasText: 'Browser Options' })
    // Add a tag via TagInput
    const tagInput = browserOptionsSection.locator('input')
    await tagInput.fill('--no-sandbox')
    await tagInput.press('Enter')
    await page.waitForTimeout(300)

    // Click update button
    await browserOptionsSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateBrowserOptions')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe('/mock/test-project')
  })

  // ── Paths ───────────────────────────────────────

  test('paths update triggers updatePaths IPC for each path', async ({ page }) => {
    await mockIPCCapture(page, 'updatePaths', { success: true })
    const pathsSection = page.locator('details').filter({ hasText: 'Paths' })
    // Fill page path
    const inputs = pathsSection.locator('input[type="text"]')
    await inputs.nth(0).fill('pages')
    await inputs.nth(1).fill('features')
    await inputs.nth(2).fill('spec')
    await inputs.nth(3).fill('helpers')

    await pathsSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updatePaths')
    expect(calls.length).toBe(4)
  })

  test('paths update shows success toast', async ({ page }) => {
    await mockIPCCapture(page, 'updatePaths', { success: true })
    const pathsSection = page.locator('details').filter({ hasText: 'Paths' })
    const inputs = pathsSection.locator('input[type="text"]')
    await inputs.nth(0).fill('pages')

    await pathsSection.getByText('Update', { exact: false }).click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })
})
