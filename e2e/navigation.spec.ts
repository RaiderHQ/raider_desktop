import { test, expect } from './electronApp'

test.describe('Navigation', () => {
  test('main layout shows header with logo', async ({ page }) => {
    const logo = page.locator('header svg')
    await expect(logo).toBeVisible()
  })

  test('main layout shows navigation links', async ({ page }) => {
    await expect(page.locator('a[href="#/recorder"]')).toBeVisible()
    await expect(page.locator('a[href="#/overview"]')).toBeVisible()
  })

  test('footer shows version text', async ({ page }) => {
    await expect(page.getByText('Ruby Raider Version')).toBeVisible()
  })

  test('navigates to Recorder page', async ({ page }) => {
    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('navigates to Tests (Overview) page', async ({ page }) => {
    await page.locator('a[href="#/overview"]').click()
    await page.waitForTimeout(800)
  })

  test('can navigate between pages sequentially', async ({ page }) => {
    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()

    await page.locator('a[href="#/overview"]').click()
    await page.waitForTimeout(500)

    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('active nav link has correct styling', async ({ page }) => {
    // Recorder is the default route and should be active
    const recorderLink = page.locator('a[href="#/recorder"]')
    await expect(recorderLink).toHaveClass(/font-semibold/)
  })

  test('version string in footer contains a version number', async ({ page }) => {
    const versionText = page.getByText('Ruby Raider Version')
    const text = await versionText.textContent()
    expect(text).toMatch(/\d+\.\d+\.\d+/)
  })
})
