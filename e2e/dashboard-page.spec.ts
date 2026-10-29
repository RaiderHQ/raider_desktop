import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'

// The results of a run live on the Overview's Dashboard tab (the recorder's own
// dashboard is gone: a test's last run is on its page)
test.describe('Dashboard tab (Overview)', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await mockRubyReady(electronApp, page)
    await setupProjectContext(page)
    await goToOverview(page)
  })

  const tab = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('button', { name, exact: true })

  test('shows the Dashboard tab', async ({ page }) => {
    await expect(tab(page, 'Dashboard')).toBeVisible()
  })

  test('shows an empty state when no tests have run', async ({ page }) => {
    await tab(page, 'Dashboard').click()
    await expect(page.getByText('No test results yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open report' })).toBeDisabled()
  })

  test('switching tabs changes active styling', async ({ page }) => {
    await expect(tab(page, 'Tests')).toHaveClass(/border-ruby/)
    await tab(page, 'Dashboard').click()
    await expect(tab(page, 'Dashboard')).toHaveClass(/border-ruby/)
    await expect(tab(page, 'Tests')).not.toHaveClass(/border-ruby/)
    await tab(page, 'Tests').click()
    await expect(tab(page, 'Tests')).toHaveClass(/border-ruby/)
  })
})
