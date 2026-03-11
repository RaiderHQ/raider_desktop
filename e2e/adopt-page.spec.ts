import { test, expect } from './electronApp'

test.describe('Adopt Project Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      window.location.hash = '#/adopt'
    })
    await page.waitForURL('**/#/adopt')
  })

  test('shows adopt page title', async ({ page }) => {
    await expect(page.getByText('Adopt a Project')).toBeVisible()
  })

  test('shows subtitle', async ({ page }) => {
    await expect(
      page.getByText('Convert an existing test project into a Ruby Raider project')
    ).toBeVisible()
  })

  test('shows step indicators', async ({ page }) => {
    // The adopt page has a multi-step flow
    await expect(page.getByText('Select Source')).toBeVisible()
  })

  test('shows select project folder button', async ({ page }) => {
    await expect(page.getByText('Select Project Folder')).toBeVisible()
  })
})
