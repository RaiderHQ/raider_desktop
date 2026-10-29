import { test, expect } from './electronApp'
import { goToOverview, navigateTo } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'

test.describe('Navigation', () => {
  test('main layout shows header with logo', async ({ page }) => {
    const logo = page.locator('header svg')
    await expect(logo).toBeVisible()
  })

  test('footer shows version text', async ({ page }) => {
    await expect(page.getByText('Ruby Raider Version')).toBeVisible()
  })

  test('with a project open, the header title links to the Overview', async ({ page }) => {
    await setupProjectContext(page)
    await navigateTo(page, '/start-project')
    await page.locator('header a[href="#/overview"]').click()
    await expect(page).toHaveURL(/#\/overview/)
    await expect(page.getByRole('button', { name: 'Tests', exact: true })).toBeVisible()
  })

  test('the old Recorder route opens the Tests tab', async ({ page }) => {
    await setupProjectContext(page)
    await navigateTo(page, '/recorder')
    await expect(page).toHaveURL(/#\/overview\/tests$/)
    await expect(page.getByRole('button', { name: 'Tests', exact: true })).toHaveClass(
      /border-ruby/
    )
  })

  test('without a project the Overview sends you to the start page', async ({ page }) => {
    await goToOverview(page)
    await expect(page).toHaveURL(/#\/start-project/)
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()
  })

  test('can navigate between the Overview tabs', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    for (const tab of ['Files', 'Dashboard', 'Tests']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await expect(page.getByRole('button', { name: tab, exact: true })).toHaveClass(/border-ruby/)
    }
  })

  test('version string in footer contains a version number', async ({ page }) => {
    const versionText = page.getByText('Ruby Raider Version')
    const text = await versionText.textContent()
    expect(text).toMatch(/\d+\.\d+\.\d+/)
  })
})
