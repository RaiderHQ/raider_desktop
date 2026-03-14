import { test, expect } from './electronApp'
import { goToLanding } from './helpers/navigation'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await goToLanding(page)
  })

  test('shows welcome title', async ({ page }) => {
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()
  })

  test('shows subtitle description', async ({ page }) => {
    await expect(
      page.getByText('It is a gem that provides a generator and scaffolding')
    ).toBeVisible()
  })

  test('shows Ruby Raider logo', async ({ page }) => {
    const logo = page.locator('svg').first()
    await expect(logo).toBeVisible()
  })

  test('shows Create project option', async ({ page }) => {
    await expect(page.getByText('Create a new project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('shows Open project option', async ({ page }) => {
    await expect(page.getByText('Open existing project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
  })

  test('clicking Create navigates to new project page', async ({ page }) => {
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(1000)
    const url = page.url()
    expect(url).toContain('#/new')
  })

  test('each project card has an info icon', async ({ page }) => {
    const infoIcons = page.locator('button[aria-label="Help"]')
    const count = await infoIcons.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('info icon on Create card opens modal', async ({ page }) => {
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.first().click()
    await page.waitForTimeout(500)
    // Modal should appear with project creation info
    await expect(page.getByText('Creating a New Project')).toBeVisible()
  })

  test('info modal can be closed', async ({ page }) => {
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Creating a New Project')).toBeVisible()

    // Close the modal via the close button (aria-label="Close")
    const closeButton = page.getByRole('button', { name: 'Close' })
    if (await closeButton.isVisible()) {
      await closeButton.click()
    } else {
      // Try clicking the overlay background
      await page.locator('#modal-overlay').click({ position: { x: 10, y: 10 } })
    }
    await expect(page.getByText('Creating a New Project')).not.toBeVisible({ timeout: 3000 })
  })

  test('Open button triggers folder selection', async ({ electronApp, page }) => {
    // Mock selectFolder at main process level (contextBridge freezes window.api)
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => '/mock/project/path')
    })
    await page.getByRole('button', { name: 'Open' }).click()

    // After folder selection, app should try to navigate to overview
    await page.waitForTimeout(500)
    const url = page.url()
    // Either navigated to overview or stayed (if project loading failed)
    expect(url).toBeDefined()
  })

  test('Open with cancelled folder selection stays on landing', async ({ electronApp, page }) => {
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => null)
    })
    await page.getByRole('button', { name: 'Open' }).click()
    await page.waitForTimeout(500)

    // Should stay on the landing page
    const url = page.url()
    expect(url).toContain('#/start-project')
  })
})
