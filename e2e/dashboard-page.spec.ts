import { test, expect } from './electronApp'
import { goToRecorder } from './helpers/navigation'
import { mockIPC, mockIPCSync } from './helpers/ipc-mock'

test.describe('Dashboard Tab (Recorder)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock IPC methods used on Recorder mount
    await mockIPC(page, 'getSelectorPriorities', [])
    await mockIPC(page, 'getSuites', [])
    await mockIPCSync(page, 'onTestRunStatus')
    await mockIPCSync(page, 'removeTestRunStatusListener')
    await goToRecorder(page)
    await page.waitForTimeout(500)
  })

  test('shows Recording tab by default', async ({ page }) => {
    // Recording tab content is shown by default
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('shows Dashboard tab button', async ({ page }) => {
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    await expect(dashboardTab).toBeVisible()
  })

  test('switching to Dashboard tab works', async ({ page }) => {
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    await dashboardTab.click()
    await page.waitForTimeout(500)

    // Recording content should be hidden
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).not.toBeVisible()
  })

  test('Recording Dashboard shows placeholder when no recording results', async ({ page }) => {
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    await dashboardTab.click()
    await page.waitForTimeout(500)

    await expect(
      page.getByText('Please run a test to see the recording results on the dashboard.')
    ).toBeVisible()
  })

  test('switching tabs changes active styling', async ({ page }) => {
    const recordingTab = page.locator('button').filter({ hasText: 'Recording' }).first()
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })

    // Recording tab is active by default
    await expect(recordingTab).toHaveClass(/border-ruby/)

    // Switch to Dashboard
    await dashboardTab.click()
    await page.waitForTimeout(300)
    await expect(dashboardTab).toHaveClass(/border-ruby/)

    // Switch back to Recording
    await recordingTab.click()
    await page.waitForTimeout(300)
    await expect(recordingTab).toHaveClass(/border-ruby/)
  })
})
