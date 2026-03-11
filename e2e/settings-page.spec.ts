import { test, expect } from './electronApp'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('nav >> text=Settings').click()
    await page.waitForURL('**/#/settings')
  })

  test('shows three settings tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'General Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Project Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recording Settings' })).toBeVisible()
  })

  test('General Settings tab is active by default', async ({ page }) => {
    const generalTab = page.getByRole('button', { name: 'General Settings' })
    // Active tab has font-semibold class
    await expect(generalTab).toHaveClass(/font-semibold/)
  })

  test('General Settings shows language selector', async ({ page }) => {
    await expect(page.getByText('Language')).toBeVisible()
  })

  test('switching to Project Settings shows no-project message', async ({ page }) => {
    await page.getByRole('button', { name: 'Project Settings' }).click()

    // Without a project loaded, shows the "No Project Loaded" message
    await expect(page.getByText('No Project Loaded')).toBeVisible()
    await expect(
      page.getByText('Please create or open a project to configure its settings.')
    ).toBeVisible()
  })

  test('switching to Recording Settings shows wait configuration', async ({ page }) => {
    await page.getByRole('button', { name: 'Recording Settings' }).click()

    await expect(page.getByText('Recording Settings', { exact: false })).toBeVisible()
    await expect(page.getByText('Implicit Wait')).toBeVisible()
    await expect(page.getByText('Explicit Wait')).toBeVisible()
  })

  test('can switch between all tabs', async ({ page }) => {
    // General -> Project -> Recording -> General
    await page.getByRole('button', { name: 'Project Settings' }).click()
    await expect(page.getByText('No Project Loaded')).toBeVisible()

    await page.getByRole('button', { name: 'Recording Settings' }).click()
    await expect(page.getByText('Implicit Wait')).toBeVisible()

    await page.getByRole('button', { name: 'General Settings' }).click()
    await expect(page.getByText('Language')).toBeVisible()
  })
})
