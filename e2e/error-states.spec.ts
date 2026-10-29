import { test, expect } from './electronApp'
import { navigateTo, goToOverview, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'

test.describe('Error States & Edge Cases', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await mockRubyReady(electronApp, page)
  })

  test('navigating to file-editor without state does not crash', async ({ page }) => {
    await navigateTo(page, '/file-editor')
    await page.waitForTimeout(500)

    // App should still be functional - can navigate away
    await navigateTo(page, '/start-project')
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()
  })

  test('rapid tab switching on the Overview does not break UI', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)

    const tab = (name: string) => page.getByRole('button', { name, exact: true })
    for (let i = 0; i < 5; i++) {
      await tab('Tests').click()
      await tab('Dashboard').click()
      await tab('Files').click()
    }

    await tab('Tests').click()
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
  })

  test('navigating between all pages rapidly does not crash', async ({ page }) => {
    await setupProjectContext(page)
    const routes = ['/recorder', '/start-project', '/new', '/overview', '/overview/tests/new']

    for (const route of routes) {
      await navigateTo(page, route)
      await page.waitForTimeout(200)
    }

    await navigateTo(page, '/recorder')
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
  })

  test('an unknown test in the route shows the list with nothing selected', async ({ page }) => {
    await setupProjectContext(page)
    await navigateTo(page, '/overview/tests/not-a-test')
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
  })

  test('double-clicking the header link does not break navigation', async ({ page }) => {
    await setupProjectContext(page)
    await navigateTo(page, '/start-project')
    await page.locator('header a[href="#/overview"]').dblclick()
    await page.waitForTimeout(800)
    // Overview page should load without crashing
    const url = page.url()
    expect(url).toContain('#/overview')
  })

  test('back button on new project page navigates away', async ({ page }) => {
    await navigateTo(page, '/start-project')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/new/)

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).not.toHaveURL(/#\/new/)
  })
})
