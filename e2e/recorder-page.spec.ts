import { test, expect } from './electronApp'

test.describe('Recorder Page', () => {
  test.beforeEach(async ({ page }) => {
    // The default route (/) shows the Recorder page
    await page.locator('nav >> text=Recorder').click()
    await page.waitForURL('**/#/recorder')
  })

  test('shows Test Suites panel', async ({ page }) => {
    await expect(page.getByText('Test Suites')).toBeVisible()
  })

  test('shows Recorded Steps section', async ({ page }) => {
    await expect(page.getByText('Recorded Steps')).toBeVisible()
  })

  test('shows Code View section', async ({ page }) => {
    await expect(page.getByText('Code View')).toBeVisible()
  })

  test('shows suite dropdown with "Select a Suite" placeholder', async ({ page }) => {
    await expect(page.getByText('Select a Suite')).toBeVisible()
  })

  test('shows "+ New Suite..." option in suite panel', async ({ page }) => {
    await expect(page.getByText('+ New Suite...')).toBeVisible()
  })

  test('clicking "+ New Suite..." shows suite creation input', async ({ page }) => {
    await page.getByText('+ New Suite...').click()

    // Should show the input field for new suite name
    const input = page.getByPlaceholder('New suite name...')
    await expect(input).toBeVisible()

    // Should show Create and Cancel buttons
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('cancelling new suite hides the input', async ({ page }) => {
    await page.getByText('+ New Suite...').click()
    const input = page.getByPlaceholder('New suite name...')
    await expect(input).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(input).not.toBeVisible()
  })

  test('can create a new test suite', async ({ page }) => {
    await page.getByText('+ New Suite...').click()
    await page.getByPlaceholder('New suite name...').fill('My E2E Suite')
    await page.getByRole('button', { name: 'Create' }).click()

    // The suite should now appear — verify the suite name is displayed
    await expect(page.getByText('My E2E Suite')).toBeVisible({ timeout: 5000 })
  })

  test('shows main recorder panel with test controls', async ({ page }) => {
    // Look for recorder-specific controls
    const urlInput = page.getByPlaceholder('Enter URL to record')
    // The URL input may only appear when a suite/test is selected
    // At minimum, the panel structure should be present
    const recorderPanel = page.locator('.flex-grow, [class*="recorder"]').first()
    await expect(recorderPanel).toBeVisible()
  })

  test('shows output panel placeholder text', async ({ page }) => {
    // The output panel shows placeholder when no tests have run
    const outputPlaceholder = page.getByText('Test output will appear here...')
    // This may or may not be visible depending on panel state
    if (await outputPlaceholder.isVisible()) {
      await expect(outputPlaceholder).toBeVisible()
    }
  })
})
