import { test, expect } from './electronApp'

test.describe('Ruby Version Warning', () => {
  test('shows warning toast when Ruby < 3.1.0', async ({ electronApp, page }) => {
    // Mock at the main process level so it survives page reload
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('is-ruby-installed')
      ipcMain.handle('is-ruby-installed', async () => ({
        success: true,
        rubyVersion: '3.0.6',
        rubyCommand: 'ruby',
        missingGems: [],
        versionWarning:
          'Ruby 3.0.6 is below the minimum 3.1.0 required by Ruby Raider v3. Some features may not work correctly.'
      }))
    })

    await page.reload()
    await page.waitForTimeout(4000)

    // The warning toast should appear (may render multiple toast elements)
    await expect(page.getByText(/below the minimum 3\.1\.0/).first()).toBeVisible({ timeout: 8000 })
  })

  test('does not show warning toast when Ruby >= 3.1.0', async ({ electronApp, page }) => {
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('is-ruby-installed')
      ipcMain.handle('is-ruby-installed', async () => ({
        success: true,
        rubyVersion: '3.2.0',
        rubyCommand: 'ruby',
        missingGems: []
      }))
    })

    await page.reload()
    await page.waitForTimeout(4000)

    // No warning toast should appear
    await expect(page.getByText(/below the minimum/)).not.toBeVisible()
  })
})
