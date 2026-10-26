import { test, expect } from './electronApp'
import { goToLanding, mockRubyReady, openProjectButton } from './helpers/navigation'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await goToLanding(page)
    await mockRubyReady(electronApp, page)
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
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible()
  })

  test('shows Open project option', async ({ page }) => {
    await expect(page.getByText('Open existing project')).toBeVisible()
    await expect(openProjectButton(page)).toBeVisible()
  })

  test('shows Recorder option', async ({ page }) => {
    // The Recorder card's button is also labelled "Open"
    await expect(page.getByText('Record a test session')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(2)
  })

  test('clicking Create navigates to new project page', async ({ page }) => {
    await page.getByRole('button', { name: 'Create', exact: true }).click()
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
    // Cards are ordered Recorder, Create, Open
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
    // Modal should appear with project creation info
    await expect(page.getByRole('heading', { name: 'Creating a New Project' })).toBeVisible()
  })

  test('info modal can be closed', async ({ page }) => {
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
    const modalTitle = page.getByRole('heading', { name: 'Creating a New Project' })
    await expect(modalTitle).toBeVisible()

    // Close the modal via the close button (aria-label="Close")
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(modalTitle).not.toBeVisible({ timeout: 3000 })
  })

  test('Open button triggers folder selection', async ({ electronApp, page }) => {
    // Mock selectFolder at main process level (contextBridge freezes window.api)
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => '/mock/project/path')
    })
    await openProjectButton(page).click()

    // After folder selection the app opens the project's Overview
    await expect(page).toHaveURL(/#\/overview/)
  })

  test('Open with cancelled folder selection stays on landing', async ({ electronApp, page }) => {
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => null)
    })
    await openProjectButton(page).click()
    await page.waitForTimeout(500)

    // Should stay on the landing page
    const url = page.url()
    expect(url).toContain('#/start-project')
  })
})
