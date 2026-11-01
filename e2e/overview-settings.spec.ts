import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './electronApp'
import { enterMainLayout, mockRubyReady } from './helpers/navigation'
import { mockMainIPCCapture } from './helpers/ipc-mock'

const PROJECT = '/mock/test-project'

async function openOverview(
  electronApp: ElectronApplication,
  page: Page,
  config: Record<string, unknown> = {}
): Promise<void> {
  await mockRubyReady(electronApp, page)
  await mockMainIPCCapture(electronApp, 'get-project-config', { success: true, config })
  await mockMainIPCCapture(electronApp, 'read-directory', [])
  await enterMainLayout(electronApp, page, PROJECT)
  // The Overview opens on the Tests tab; the settings toolbar is on Files
  await page.getByRole('button', { name: 'Files', exact: true }).click()
}

test.describe('Overview settings toolbar', () => {
  test('browser dropdown offers only Chrome and Firefox', async ({ electronApp, page }) => {
    await openOverview(electronApp, page)
    const options = page.locator('[data-testid="overview-browser-select"] option')
    await expect(options).toHaveCount(2)
    await expect(options).toHaveText(['Chrome', 'Firefox'])
  })

  test('run mode offers All, Smoke and Regression but no Custom Tag', async ({
    electronApp,
    page
  }) => {
    await openOverview(electronApp, page)
    const select = page.locator('[data-testid="overview-run-mode-select"]')
    await expect(select.locator('option')).toHaveCount(3)
    await expect(select).not.toContainText('Custom')
    await expect(page.locator('[data-testid="overview-custom-tag-input"]')).toHaveCount(0)
  })

  test('timeout and browser args are read back from the project config', async ({
    electronApp,
    page
  }) => {
    await openOverview(electronApp, page, {
      baseUrl: 'https://example.com',
      browser: 'chrome',
      timeout: 10,
      browserArguments: ['no-sandbox', 'disable-gpu']
    })
    await expect(page.locator('#timeout-input')).toHaveValue('10')
    await expect(page.getByText('no-sandbox')).toBeVisible()
    await expect(page.getByText('disable-gpu')).toBeVisible()
    await expect(page.locator('[data-testid="overview-url-input"]')).toHaveValue(
      'https://example.com'
    )
  })
})
