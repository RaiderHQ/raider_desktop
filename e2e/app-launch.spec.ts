import { test, expect } from './electronApp'

test.describe('App Launch', () => {
  test('opens a window on startup', async ({ page }) => {
    // The page fixture ensures a window exists and is loaded
    const title = await page.title()
    expect(title).toBeDefined()
  })

  test('window has correct default dimensions', async ({ page }) => {
    const viewport = page.viewportSize()
    expect(viewport).toBeDefined()
    if (viewport) {
      expect(viewport.width).toBeGreaterThanOrEqual(800)
      expect(viewport.height).toBeGreaterThanOrEqual(600)
    }
  })

  test('window title is Ruby Raider', async ({ page }) => {
    const title = await page.title()
    expect(title).toContain('Ruby Raider')
  })

  test('renderer process loads without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(1000)

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('React Router Future Flag') &&
        !e.includes('NO_I18NEXT_INSTANCE') &&
        !e.includes('net::') &&
        !e.includes('Failed to fetch') &&
        !e.includes('ResizeObserver') &&
        !e.includes('rubyCommand')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('default route loads the Recorder page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
    await expect(page.getByText('Recorded Steps')).toBeVisible()
  })

  test('all navigation links are present on initial load', async ({ page }) => {
    await expect(page.locator('a[href="#/recorder"]')).toBeVisible()
    await expect(page.locator('a[href="#/overview"]')).toBeVisible()
  })

  test('header logo is visible on launch', async ({ page }) => {
    const logo = page.locator('header svg')
    await expect(logo).toBeVisible()
  })

  test('footer shows version number', async ({ page }) => {
    await expect(page.getByText(/Ruby Raider Version: \d+\.\d+\.\d+/)).toBeVisible()
  })
})
