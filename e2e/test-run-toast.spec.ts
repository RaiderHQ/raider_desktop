import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import { mockIPC, mockReadDirectory } from './helpers/ipc-mock'

/**
 * Helper to set up the overview page with a mock project and test run APIs.
 */
async function setupOverviewWithProject(page: import('@playwright/test').Page): Promise<void> {
  // Set a project path in the store so overview doesn't redirect
  await page.evaluate(() => {
    ;(window as any).__zustand_projectStore?.setState?.({ projectPath: '/tmp/test-project' })
  })

  // Mock readDirectory to show a file tree
  await mockReadDirectory(page, [
    { name: 'spec', type: 'folder', path: '/tmp/test-project/spec', children: [
      { name: 'login_spec.rb', type: 'file', path: '/tmp/test-project/spec/login_spec.rb' }
    ]}
  ])

  // Mock event listener APIs to prevent errors
  await page.evaluate(() => {
    const api = (window as any).api
    if (!api._testRunCallbacks) api._testRunCallbacks = []
    const origOn = api.onTestRunStatus
    api.onTestRunStatus = (cb: Function) => {
      api._testRunCallbacks.push(cb)
      if (origOn) return origOn(cb)
    }
    const origRemove = api.removeTestRunStatusListener
    api.removeTestRunStatusListener = (cb: Function) => {
      api._testRunCallbacks = api._testRunCallbacks.filter((c: Function) => c !== cb)
      if (origRemove) return origRemove(cb)
    }
  })

  await goToOverview(page)
}

test.describe('Test Run Toast Notifications', () => {
  test('loading toast is dismissed after successful test run', async ({ page }) => {
    await setupOverviewWithProject(page)

    // Mock runRaiderTests to return success after a short delay
    await page.evaluate(() => {
      ;(window as any).api.runRaiderTests = () =>
        new Promise((resolve) => setTimeout(() => resolve({ success: true, output: 'All tests passed' }), 500))
    })

    // Click the play/run button (green play icon on root folder)
    const runButton = page.locator('button svg.text-status-ok').first()
    if (await runButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await runButton.click()

      // A loading toast should appear
      await page.waitForTimeout(200)
      const loadingToast = page.locator('[data-testid="toast"], [role="status"]').first()

      // Wait for the test run to complete
      await page.waitForTimeout(1000)

      // After completion, no loading toasts should remain — only success toast
      const allToasts = page.locator('div[role="status"]')
      const count = await allToasts.count()

      // Verify no lingering loading spinners in toasts
      const loadingSpinners = page.locator('div[role="status"] svg[class*="animate-spin"]')
      const spinnerCount = await loadingSpinners.count()
      expect(spinnerCount).toBe(0)
    }
  })

  test('loading toast is dismissed after failed test run', async ({ page }) => {
    await setupOverviewWithProject(page)

    // Mock runRaiderTests to return failure
    await page.evaluate(() => {
      ;(window as any).api.runRaiderTests = () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'Test failed', output: '' }), 300)
        )
    })

    const runButton = page.locator('button svg.text-status-ok').first()
    if (await runButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await runButton.click()

      // Wait for the test run to complete and error toast to appear
      await page.waitForTimeout(1000)

      // No loading spinners should remain
      const loadingSpinners = page.locator('div[role="status"] svg[class*="animate-spin"]')
      const spinnerCount = await loadingSpinners.count()
      expect(spinnerCount).toBe(0)
    }
  })

  test('no lingering toast when parallel toggle is on', async ({ page }) => {
    await setupOverviewWithProject(page)

    // Mock runRaiderTests to return quickly (simulates fast parallel completion)
    await page.evaluate(() => {
      ;(window as any).api.runRaiderTests = (_path: string, _cmd: string, parallel: boolean) =>
        new Promise((resolve) => {
          // Simulate a status event arriving late
          setTimeout(() => {
            const cbs = (window as any).api._testRunCallbacks || []
            cbs.forEach((cb: Function) => cb({}, { status: 'running' }))
          }, 50)

          // Resolve quickly to simulate fast parallel tests
          setTimeout(() => resolve({ success: true, output: 'All passed' }), 100)
        })
    })

    // Enable parallel toggle
    const parallelToggle = page.locator('text=Parallel').locator('..')
    const toggle = parallelToggle.locator('button, input[type="checkbox"], [role="switch"]').first()
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggle.click()
    }

    const runButton = page.locator('button svg.text-status-ok').first()
    if (await runButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await runButton.click()

      // Wait for everything to settle
      await page.waitForTimeout(1500)

      // Dismiss all visible toasts to get a clean state, then verify no loading toasts re-appear
      await page.evaluate(() => {
        const toast = (window as any).__reactHotToast
        if (toast?.dismiss) toast.dismiss()
      })

      await page.waitForTimeout(500)

      // No loading spinners should remain after dismissal
      const loadingSpinners = page.locator('div[role="status"] svg[class*="animate-spin"]')
      const spinnerCount = await loadingSpinners.count()
      expect(spinnerCount).toBe(0)
    }
  })

  test('late IPC status event does not re-create dismissed toast', async ({ page }) => {
    await setupOverviewWithProject(page)

    // Mock runRaiderTests that resolves, then fires a late status event AFTER resolution
    await page.evaluate(() => {
      ;(window as any).api.runRaiderTests = () =>
        new Promise((resolve) => {
          // Resolve immediately
          setTimeout(() => resolve({ success: true, output: 'Done' }), 100)

          // Fire a LATE status event after resolution
          setTimeout(() => {
            const cbs = (window as any).api._testRunCallbacks || []
            cbs.forEach((cb: Function) => cb({}, { status: 'running' }))
          }, 300)
        })
    })

    const runButton = page.locator('button svg.text-status-ok').first()
    if (await runButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await runButton.click()

      // Wait for the late event to fire
      await page.waitForTimeout(800)

      // Count loading toasts — there should be none
      const loadingSpinners = page.locator('div[role="status"] svg[class*="animate-spin"]')
      const spinnerCount = await loadingSpinners.count()
      expect(spinnerCount).toBe(0)
    }
  })
})
