import { test, expect } from './electronApp'
import { goToOverviewFiles, mockRubyReady } from './helpers/navigation'
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

test.describe('Test Execution Features', () => {
  test.describe('Run Mode Select (tag-based execution)', () => {
    test('renders run mode dropdown with All, Smoke, Regression options', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)

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
      await goToOverviewFiles(page)
      await mockIPCCapture(page, 'runRaiderTests', { success: true, output: '5 examples, 0 failures' })

      // Ensure run mode is "all" (default)
      const select = page.getByTestId('overview-run-mode-select')
      await expect(select).toHaveValue('all')

      // The run button (play icon on the root folder)
      await page.getByTitle('Run tests').click()

      // Verify runRaiderTests was called (not runRakeTask)
      await expect.poll(async () => (await getIPCCalls(page, 'runRaiderTests')).length).toBe(1)
      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      expect(calls[0][0]).toBe('/mock/test-project') // folderPath
      expect(calls[0][1]).toBe('ruby') // rubyCommand
    })

    test('calls runRakeTask with "smoke" when run mode is smoke', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)
      await mockIPCCapture(page, 'runRakeTask', { success: true, output: '2 examples, 0 failures' })
      await mockIPCCapture(page, 'runRaiderTests', { success: true })

      // Switch to smoke mode
      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      // The run button (play icon on the root folder)
      await page.getByTitle('Run tests').click()

      // Verify runRakeTask was called with "smoke", NOT runRaiderTests
      await expect.poll(async () => (await getIPCCalls(page, 'runRakeTask')).length).toBe(1)
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
      await goToOverviewFiles(page)
      await mockIPCCapture(page, 'runRakeTask', { success: true, output: '5 examples, 0 failures' })

      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('regression')

      // The run button (play icon on the root folder)
      await page.getByTitle('Run tests').click()

      await expect.poll(async () => (await getIPCCalls(page, 'runRakeTask')).length).toBe(1)
      const calls = await getIPCCalls(page, 'runRakeTask')
      expect(calls.length).toBe(1)
      expect(calls[0][2]).toBe('regression')
    })

    test('shows error toast when runRakeTask fails', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)
      await mockIPCCaptureFailure(page, 'runRakeTask', "Don't know how to build task 'smoke'")

      const select = page.getByTestId('overview-run-mode-select')
      await select.selectOption('smoke')

      // The run button (play icon on the root folder)
      await page.getByTitle('Run tests').click()

      // Verify error toast appears
      await expect(page.getByText("Don't know how to build task 'smoke'")).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Re-run Failed Tests', () => {
    test('renders re-run failed button', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await expect(btn).toBeVisible()
    })

    test('calls rerunFailedTests on click', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)
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
      await goToOverviewFiles(page)
      await mockIPCCaptureFailure(page, 'rerunFailedTests', 'No rerun.txt found')

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await btn.click()

      await expect(page.getByText('No rerun.txt found')).toBeVisible({ timeout: 5000 })
    })

    test('re-run button is independent of run mode selection', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)
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
    test('run mode and re-run are only visible on Files tab', async ({ page }) => {
      await setupProjectContext(page)
      await goToOverviewFiles(page)

      // Visible on Files tab
      await expect(page.getByTestId('overview-run-mode-select')).toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).toBeVisible()

      // Switch to Scaffolding tab
      await page.getByText('Scaffolding', { exact: true }).click()

      await expect(page.getByTestId('overview-run-mode-select')).not.toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).not.toBeVisible()
    })
  })
})
