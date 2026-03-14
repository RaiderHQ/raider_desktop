import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPCCapture,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

test.describe('Test Execution Features', () => {
  test.describe('Run Mode Select (tag-based execution)', () => {
    test('renders run mode dropdown with All, Smoke, Regression options', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)

      const select = page.getByTestId('overview-run-mode-select')
      await expect(select).toBeVisible()

      const options = select.locator('option')
      await expect(options).toHaveCount(3)
      await expect(options.nth(0)).toHaveAttribute('value', 'all')
      await expect(options.nth(1)).toHaveAttribute('value', 'smoke')
      await expect(options.nth(2)).toHaveAttribute('value', 'regression')
    })

    test('calls runRaiderTests when run mode is "all"', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRaiderTests', { success: true, output: '5 examples, 0 failures' })

      // Ensure run mode is "all" (default)
      const select = page.getByTestId('overview-run-mode-select')
      await expect(select).toHaveValue('all')

      // Click the run button (play icon on the root folder)
      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      // Verify runRaiderTests was called (not runRakeTask)
      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      expect(calls[0][0]).toBe('/mock/test-project') // folderPath
      expect(calls[0][1]).toBe('ruby') // rubyCommand
    })

    test('calls runRakeTask with "smoke" when run mode is smoke', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRakeTask', { success: true, output: '2 examples, 0 failures' })
      await mockIPCCapture(page, 'runRaiderTests', { success: true })

      // Switch to smoke mode
      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      // Click the run button
      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      // Verify runRakeTask was called with "smoke", NOT runRaiderTests
      const rakeCalls = await getIPCCalls(page, 'runRakeTask')
      expect(rakeCalls.length).toBe(1)
      expect(rakeCalls[0][0]).toBe('/mock/test-project')
      expect(rakeCalls[0][1]).toBe('ruby')
      expect(rakeCalls[0][2]).toBe('smoke')

      const testCalls = await getIPCCalls(page, 'runRaiderTests')
      expect(testCalls.length).toBe(0)
    })

    test('calls runRakeTask with "regression" when run mode is regression', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRakeTask', { success: true, output: '5 examples, 0 failures' })

      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('regression')

      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      const calls = await getIPCCalls(page, 'runRakeTask')
      expect(calls.length).toBe(1)
      expect(calls[0][2]).toBe('regression')
    })

    test('shows error toast when runRakeTask fails', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCaptureFailure(page, 'runRakeTask', "Don't know how to build task 'smoke'")

      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      // Verify error toast appears
      await expect(page.getByText("Don't know how to build task 'smoke'")).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Retry Configuration', () => {
    test('renders retry input with default value 0', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)

      const retryInput = page.getByTestId('overview-retry-input')
      await expect(retryInput).toBeVisible()
      await expect(retryInput).toHaveValue('0')
    })

    test('passes retryCount to runRaiderTests when set', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRaiderTests', { success: true, output: 'ok' })

      // Set retry count to 3
      const retryInput = page.getByTestId('overview-retry-input')
      await retryInput.fill('3')

      // Run tests
      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      // args: folderPath, rubyCommand, parallel, retryCount
      expect(calls[0][3]).toBe(3) // retryCount
    })

    test('does not pass retryCount when set to 0', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRaiderTests', { success: true, output: 'ok' })

      // Ensure retry is 0
      const retryInput = page.getByTestId('overview-retry-input')
      await expect(retryInput).toHaveValue('0')

      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      // retryCount should be undefined when 0
      expect(calls[0][3]).toBeUndefined()
    })

    test('clamps retry input between 0 and 5', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)

      const retryInput = page.getByTestId('overview-retry-input')

      // Try setting to 10 — should clamp to 5
      await retryInput.fill('10')
      await retryInput.dispatchEvent('change')
      await expect(retryInput).toHaveValue('5')

      // Try setting to -1 — should clamp to 0
      await retryInput.fill('-1')
      await retryInput.dispatchEvent('change')
      await expect(retryInput).toHaveValue('0')
    })

    test('retry count is ignored when run mode is smoke/regression', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'runRakeTask', { success: true, output: 'ok' })

      // Set retry count to 3 and run mode to smoke
      const retryInput = page.getByTestId('overview-retry-input')
      await retryInput.fill('3')
      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      const playButton = page.locator('button svg.text-status-ok').first()
      await playButton.click()

      // Smoke uses runRakeTask which doesn't accept retryCount
      const calls = await getIPCCalls(page, 'runRakeTask')
      expect(calls.length).toBe(1)
      expect(calls[0].length).toBe(3) // only folderPath, rubyCommand, taskName
    })
  })

  test.describe('Re-run Failed Tests', () => {
    test('renders re-run failed button', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await expect(btn).toBeVisible()
    })

    test('calls rerunFailedTests on click', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'rerunFailedTests', { success: true, output: '1 example, 0 failures' })

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await btn.click()

      const calls = await getIPCCalls(page, 'rerunFailedTests')
      expect(calls.length).toBe(1)
      expect(calls[0][0]).toBe('/mock/test-project')
      expect(calls[0][1]).toBe('ruby')
    })

    test('shows error toast when rerunFailedTests fails', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCaptureFailure(page, 'rerunFailedTests', 'No rerun.txt found')

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await btn.click()

      await expect(page.getByText('No rerun.txt found')).toBeVisible({ timeout: 5000 })
    })

    test('re-run button is independent of run mode selection', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)
      await mockIPCCapture(page, 'rerunFailedTests', { success: true, output: 'ok' })
      await mockIPCCapture(page, 'runRakeTask', { success: true })

      // Set run mode to smoke
      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      // Click re-run — should call rerunFailedTests, NOT runRakeTask
      const btn = page.getByTestId('overview-rerun-failed-btn')
      await btn.click()

      const rerunCalls = await getIPCCalls(page, 'rerunFailedTests')
      expect(rerunCalls.length).toBe(1)

      const rakeCalls = await getIPCCalls(page, 'runRakeTask')
      expect(rakeCalls.length).toBe(0)
    })
  })

  test.describe('Controls visibility', () => {
    test('run mode, retry, and re-run are only visible on Files tab', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverview(page)

      // Visible on Files tab
      await expect(page.getByTestId('overview-run-mode-select')).toBeVisible()
      await expect(page.getByTestId('overview-retry-input')).toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).toBeVisible()

      // Switch to Scaffolding tab
      await page.getByText('Scaffolding', { exact: true }).click()

      await expect(page.getByTestId('overview-run-mode-select')).not.toBeVisible()
      await expect(page.getByTestId('overview-retry-input')).not.toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).not.toBeVisible()
    })
  })
})
