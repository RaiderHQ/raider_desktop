import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import {
  goToLanding,
  mockRubyReady,
  navigateTo,
  newProjectButton,
  openProjectButton
} from './helpers/navigation'
import { mockIPC, setRubyCommand } from './helpers/ipc-mock'

/** The home page as a first launch shows it: no recent projects, no quick recordings */
async function showFirstLaunch(page: Page): Promise<void> {
  await mockIPC(page, 'listRecentProjects', [])
  await mockIPC(page, 'listQuickProjects', [])
  // Landing reads the lists when it opens
  await navigateTo(page, '/new')
  await goToLanding(page)
}

test.describe('Landing Page', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await goToLanding(page)
    await mockRubyReady(electronApp, page)
  })

  test('shows welcome title', async ({ page }) => {
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()
  })

  test('shows subtitle description', async ({ page }) => {
    await showFirstLaunch(page)
    await expect(
      page.getByText('Record, run and fix UI tests without leaving the app.')
    ).toBeVisible()
  })

  test('shows Ruby Raider logo', async ({ page }) => {
    const logo = page.locator('svg').first()
    await expect(logo).toBeVisible()
  })

  test('shows the setup line once Ruby is checked', async ({ page }) => {
    // mockRubyReady answers Ruby 3.2.0 and raider version 4.0.1, whatever the host has
    await expect(page.getByTestId('setup-line')).toHaveText('Ruby 3.2.0 · Ruby Raider 4.0.1 ✓')
    await expect(page.getByRole('button', { name: 'Record a test' })).toBeEnabled()
  })

  test('shows New project… and Open project… with their shortcuts', async ({ page }) => {
    await expect(newProjectButton(page)).toBeVisible()
    await expect(newProjectButton(page)).toContainText(/⌘⇧N|Ctrl\+Shift\+N/)
    await expect(openProjectButton(page)).toBeVisible()
    await expect(openProjectButton(page)).toContainText(/⌘O|Ctrl\+O/)
  })

  test('How Ruby Raider works opens the concepts', async ({ page }) => {
    await page.getByRole('button', { name: 'How Ruby Raider works' }).last().click()
    await expect(page.getByRole('heading', { name: 'How Ruby Raider works' })).toBeVisible()
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
    // A returning user: the start buttons become one row above the lists
    await expect(page.getByTestId('landing')).toHaveAttribute('data-layout', 'recents')
    await expect(
      page.getByTestId('start-row').getByRole('button', { name: 'Record a test' })
    ).toBeVisible()
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

  test('shows Record a test as the primary start', async ({ page }) => {
    await showFirstLaunch(page)
    await expect(page.getByTestId('landing')).toHaveAttribute('data-layout', 'start')
    await expect(page.getByRole('button', { name: 'Record a test' })).toBeVisible()
    await expect(
      page.getByText('Raider keeps it in its own folder until you save it somewhere.')
    ).toBeVisible()
  })

  test('without the gems, Record a test is disabled and Fix… opens the gems help', async ({
    electronApp,
    page
  }) => {
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('is-ruby-installed')
      ipcMain.handle('is-ruby-installed', async () => ({
        success: false,
        rubyVersion: '3.2.0',
        rubyCommand: 'ruby',
        missingGems: ['ruby_raider']
      }))
    })
    await page.reload()
    await goToLanding(page)
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.getByTestId('setup-line')).toContainText('ruby_raider')
    await expect(page.getByRole('button', { name: 'Record a test' })).toBeDisabled()
    await page.getByRole('button', { name: 'Fix…' }).click()
    await expect(page.getByRole('heading', { name: 'Missing gems' })).toBeVisible()

    // While it is open, File › New project… and Help › How it works stand down
    await electronApp.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents
      contents.send('menu-command', 'new-project')
      contents.send('menu-command', 'how-it-works')
    })
    await page.waitForTimeout(500)
    expect(page.url()).toContain('#/start-project')
    await expect(page.getByRole('heading', { name: 'How Ruby Raider works' })).toHaveCount(0)
  })

  test('Quick record opens its dialog and Cancel closes it', async ({ page }) => {
    await setRubyCommand(page, 'ruby')
    await page.getByRole('button', { name: 'Record a test' }).click()
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

  test('New project… navigates to new project page', async ({ page }) => {
    await newProjectButton(page).click()
    await expect(page).toHaveURL(/#\/new/)
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
