import { test, expect } from './electronApp'

test.describe('Navigation', () => {
  test('main layout shows header with logo', async ({ page }) => {
    const logo = page.locator('img[alt="Logo"]')
    await expect(logo).toBeVisible()
  })

  test('main layout shows navigation links', async ({ page }) => {
    // The nav links: Tests, Recorder, Dashboard, Settings
    await expect(page.locator('nav >> text=Recorder')).toBeVisible()
    await expect(page.locator('nav >> text=Dashboard')).toBeVisible()
    await expect(page.locator('nav >> text=Settings')).toBeVisible()
  })

  test('footer shows version text', async ({ page }) => {
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
    await expect(footer).toContainText('Ruby Raider Version')
  })

  test('navigates to Settings page', async ({ page }) => {
    await page.locator('nav >> text=Settings').click()
    await page.waitForURL('**/#/settings')

    // Settings page has tabs
    await expect(page.getByText('General Settings')).toBeVisible()
  })

  test('navigates to Dashboard page', async ({ page }) => {
    await page.locator('nav >> text=Dashboard').click()
    await page.waitForURL('**/#/dashboard')

    // Dashboard page has Project/Recording tabs
    await expect(page.getByText('Project Dashboard')).toBeVisible()
  })

  test('navigates to Recorder page', async ({ page }) => {
    await page.locator('nav >> text=Recorder').click()
    await page.waitForURL('**/#/recorder')

    // Recorder page has the test suites panel
    await expect(page.getByText('Test Suites')).toBeVisible()
  })

  test('navigates to Tests (Overview) page', async ({ page }) => {
    await page.locator('nav >> text=Tests').click()
    await page.waitForURL('**/#/overview')
  })

  test('can navigate between pages sequentially', async ({ page }) => {
    // Settings -> Dashboard -> Recorder -> back to Settings
    await page.locator('nav >> text=Settings').click()
    await expect(page.getByText('General Settings')).toBeVisible()

    await page.locator('nav >> text=Dashboard').click()
    await expect(page.getByText('Project Dashboard')).toBeVisible()

    await page.locator('nav >> text=Recorder').click()
    await expect(page.getByText('Test Suites')).toBeVisible()

    await page.locator('nav >> text=Settings').click()
    await expect(page.getByText('General Settings')).toBeVisible()
  })
})
