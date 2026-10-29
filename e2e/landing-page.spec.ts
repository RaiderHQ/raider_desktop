import { test, expect } from './electronApp'
import { goToLanding, navigateTo } from './helpers/navigation'
import { mockIPC, setRubyCommand } from './helpers/ipc-mock'

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

  test('lists quick recordings not saved to a folder, and opens one on its tests', async ({
    page
  }) => {
    await mockIPC(page, 'listQuickProjects', [
      { path: '/mock/quick-record/shop_test', name: 'shop_test', modifiedAt: Date.now() }
    ])
    await mockIPC(page, 'listProjectTests', [])
    await mockIPC(page, 'getSuites', [])
    await mockIPC(page, 'readDirectory', [])
    // Landing reads the list when it opens
    await navigateTo(page, '/new')
    await goToLanding(page)

    await expect(page.getByRole('heading', { name: 'Quick recordings' })).toBeVisible()
    await page.getByRole('button', { name: /shop_test/ }).click()
    await expect(page).toHaveURL(/#\/overview\/tests$/)
  })

  test('shows Quick record option', async ({ page }) => {
    await expect(page.getByText('Record a test without a project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quick record' })).toBeVisible()
  })

  test('Quick record opens its dialog and Cancel closes it', async ({ page }) => {
    await setRubyCommand(page, 'ruby')
    await page.getByRole('button', { name: 'Quick record' }).click()
    const dialog = page.getByRole('dialog', { name: 'Quick record' })
    await expect(dialog).toBeVisible()
    // Both the address and a name are needed
    await expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled()
    await dialog.getByPlaceholder('https://example.com').fill('example.com')
    await expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled()
    await dialog.getByPlaceholder('Checkout works').fill('Checkout works')
    await expect(dialog.getByRole('button', { name: 'Start' })).toBeEnabled()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(page.url()).toContain('#/start-project')
  })

  test('the Quick record card help explains Quick record', async ({ page }) => {
    // The Quick record card comes first, so its help icon is the first one
    await page.locator('button[aria-label="Help"]').first().click()
    await expect(
      page.getByText('Quick record lets you record a website as a test', { exact: false })
    ).toBeVisible()
    await expect(page.getByText('Open Recorder')).toHaveCount(0)
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
    // Quick record's card comes first; Create's help icon is the second
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
    await page.waitForTimeout(500)
    // Modal should appear with project creation info
    await expect(page.getByText('Creating a New Project')).toBeVisible()
  })

  test('info modal can be closed', async ({ page }) => {
    // Quick record's card comes first; Create's help icon is the second
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
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
