import { test, expect } from './electronApp'
import { goToLanding, mockRubyReady, navigateTo, openProjectButton } from './helpers/navigation'
import { mockIPC, setRubyCommand } from './helpers/ipc-mock'

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
      page.getByText('Record, run and fix UI tests without leaving the app.')
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

  test('lists quick recordings not saved to a folder, and opens one on its tests', async ({
    page
  }) => {
    await mockIPC(page, 'listQuickProjects', [
      { path: '/mock/quick-record/shop_test', name: 'shop_test', modifiedAt: Date.now() }
    ])
    await mockIPC(page, 'listProjectTests', [])
    await mockIPC(page, 'getTests', [])
    await mockIPC(page, 'readDirectory', [])
    // Landing reads the list when it opens
    await navigateTo(page, '/new')
    await goToLanding(page)

    await expect(page.getByRole('heading', { name: 'Quick recordings' })).toBeVisible()
    await page.getByRole('button', { name: /shop_test/ }).click()
    await expect(page).toHaveURL(/#\/overview\/tests$/)
  })

  test('lists recent projects, opens one with no folder dialog, and removes one (U8)', async ({
    page
  }) => {
    await mockIPC(page, 'listRecentProjects', [
      {
        path: '/mock/test-project',
        name: 'test-project',
        lastOpened: Date.now(),
        exists: true,
        isRaider: true
      },
      { path: '/mock/gone', name: 'gone', lastOpened: 1, exists: false, isRaider: false }
    ])
    await mockIPC(page, 'removeRecentProject', [
      {
        path: '/mock/test-project',
        name: 'test-project',
        lastOpened: Date.now(),
        exists: true,
        isRaider: true
      }
    ])
    await mockIPC(page, 'listProjectTests', [])
    await mockIPC(page, 'getTests', [])
    await mockIPC(page, 'readDirectory', [])
    // Landing reads the list when it opens
    await navigateTo(page, '/new')
    await goToLanding(page)

    const section = page.getByRole('region', { name: 'Recent projects' })
    await expect(section).toBeVisible()
    await expect(section.getByText('Folder not found')).toBeVisible()
    await section.getByRole('button', { name: 'Remove gone from recent projects' }).click()
    await expect(section.getByText('gone', { exact: true })).toHaveCount(0)
    await section.getByRole('button', { name: /^test-project/ }).click()
    await expect(page).toHaveURL(/#\/overview/)
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
    // Quick record's card comes first; Create's help icon is the second
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
    // Modal should appear with project creation info
    await expect(page.getByRole('heading', { name: 'Creating a new project' })).toBeVisible()
  })

  test('Learn more in a card help opens the documentation page through the main process', async ({
    electronApp,
    page
  }) => {
    // Record instead of opening a real browser
    await electronApp.evaluate(async ({ shell }) => {
      const opened: string[] = []
      ;(globalThis as unknown as { __openedUrls: string[] }).__openedUrls = opened
      shell.openExternal = async (url: string): Promise<void> => {
        opened.push(url)
      }
    })
    await page.locator('button[aria-label="Help"]').nth(1).click()
    await expect(page.getByRole('heading', { name: 'Creating a New Project' })).toBeVisible()
    await page.getByRole('button', { name: /Learn more about .* in the documentation/ }).click()
    await expect
      .poll(() =>
        electronApp.evaluate(
          () => (globalThis as unknown as { __openedUrls: string[] }).__openedUrls
        )
      )
      .toEqual(['https://ruby-raider.onrender.com/docs/projects.html'])
  })

  test('info modal can be closed', async ({ page }) => {
    // Quick record's card comes first; Create's help icon is the second
    const infoIcons = page.locator('button[aria-label="Help"]')
    await infoIcons.nth(1).click()
    const modalTitle = page.getByRole('heading', { name: 'Creating a new project' })
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
