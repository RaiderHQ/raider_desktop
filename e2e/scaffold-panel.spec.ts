import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPCCapture,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Scaffold Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    // Click Scaffolding tab
    await page.getByText('Scaffolding', { exact: true }).click()
    await page.waitForTimeout(500)
  })

  test('Scaffolding tab shows the type, name and Generate', async ({ page }) => {
    await expect(page.getByText('Type', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('e.g. login')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible()
  })

  test('Quick Generate triggers scaffoldGenerate with correct params', async ({ page }) => {
    await mockIPCCapture(page, 'scaffoldGenerate', { success: true, output: 'Generated login_page' })
    // Mock readDirectory for reload
    await mockIPCCapture(page, 'readDirectory', [])

    // Fill in the name
    const nameInput = page.locator('input[placeholder*="login"]')
    await nameInput.fill('login')

    // Click Generate
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'scaffoldGenerate')
    expect(calls.length).toBe(1)
    const params = calls[0][0] as Record<string, unknown>
    expect(params.operation).toBe('generate')
    expect(params.name).toBe('login')
    expect(calls[0][1]).toBe('/mock/test-project')
    expect(calls[0][2]).toBe('ruby')
  })

  test('success toast after generate', async ({ page }) => {
    await mockIPCCapture(page, 'scaffoldGenerate', { success: true, output: 'Done' })
    await mockIPCCapture(page, 'readDirectory', [])

    const nameInput = page.locator('input[placeholder*="login"]')
    await nameInput.fill('test_page')

    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('error toast on failure', async ({ page }) => {
    await mockIPCCaptureFailure(page, 'scaffoldGenerate', 'Generation failed')
    await mockIPCCapture(page, 'readDirectory', [])

    const nameInput = page.locator('input[placeholder*="login"]')
    await nameInput.fill('test_page')

    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })
})
