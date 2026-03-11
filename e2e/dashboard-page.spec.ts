import { test, expect } from './electronApp'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('nav >> text=Dashboard').click()
    await page.waitForURL('**/#/dashboard')
  })

  test('shows Project Dashboard tab by default', async ({ page }) => {
    const projectTab = page.getByRole('button', { name: 'Project Dashboard' })
    await expect(projectTab).toBeVisible()
    await expect(projectTab).toHaveClass(/font-semibold/)
  })

  test('shows Recording Dashboard tab', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Recording Dashboard' })).toBeVisible()
  })

  test('switching to Recording Dashboard tab works', async ({ page }) => {
    await page.getByRole('button', { name: 'Recording Dashboard' }).click()

    const recordingTab = page.getByRole('button', { name: 'Recording Dashboard' })
    await expect(recordingTab).toHaveClass(/font-semibold/)
  })

  test('shows placeholder message when no tests have been run', async ({ page }) => {
    // Project dashboard should show a message about running tests
    await expect(
      page.getByText('Please run your tests to see the results on the dashboard.')
    ).toBeVisible()
  })

  test('Recording Dashboard shows placeholder when no recording results', async ({ page }) => {
    await page.getByRole('button', { name: 'Recording Dashboard' }).click()

    await expect(
      page.getByText('Please run a test to see the recording results on the dashboard.')
    ).toBeVisible()
  })

  test('dashboard has the styled container with orange accent', async ({ page }) => {
    // The dashboard container has a bg-[#c14420] accent div
    const accentDiv = page.locator('.bg-\\[\\#c14420\\]')
    await expect(accentDiv).toBeVisible()
  })
})
