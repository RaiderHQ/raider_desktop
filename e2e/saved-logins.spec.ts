import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { goToOverviewDashboard, goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'
import { mockRunner, getStartRequests, started, phase, finished } from './helpers/run-mock'

// Saved logins are read from the project folder by the main process, so the
// project is a real folder on disk. Setting it in the renderer's store makes
// the app activate it in main, as opening a project does.
let projectPath: string

const authDir = (): string => join(projectPath, '.raider', 'auth')

test.beforeEach(async ({ electronApp, page }) => {
  projectPath = realpathSync(mkdtempSync(join(tmpdir(), 'raider-saved-logins-')))
  mkdirSync(join(projectPath, 'config'))
  writeFileSync(join(projectPath, 'config', 'config.yml'), 'url: https://shop.example.com\n')
  mkdirSync(authDir(), { recursive: true })
  writeFileSync(
    join(authDir(), 'admin.json'),
    JSON.stringify({
      format: 1,
      name: 'admin',
      origin: 'https://shop.example.com',
      saved_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      cookies: [{ name: 'sid', value: 'SECRET-COOKIE' }],
      local_storage: { t: 'SECRET-STORAGE' }
    })
  )
  writeFileSync(join(authDir(), 'admin.lock'), '')

  // The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
  await mockRubyReady(electronApp, page)
  await setupProjectContext(page, { projectPath })
  // Main has activated the project once the renderer has its layout
  await page.waitForFunction(
    () => (window as any).__TEST_STORES__?.projectStore?.getState().layout !== null
  )
})

test.afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true })
})

const runTests = async (page: Page): Promise<void> => {
  await page.getByTitle('Run tests').click()
}

const quickRun = {
  events: [started(), phase('booting'), finished('passed', { total: 1, passed: 1 })]
}

test.describe('Saved logins', () => {
  test('the Dashboard lists the saved login without its contents', async ({ page }) => {
    await goToOverviewDashboard(page)

    const row = page.getByTestId('saved-login-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('admin')
    await expect(row).toContainText('shop.example.com')
    await expect(page.getByTestId('saved-login-expired')).toHaveCount(0)
    // Checked as a boolean so a failure never prints the page text
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.includes('SECRET')).toBe(false)
  })

  test('Forget removes the saved login and keeps its lock file', async ({ page }) => {
    await goToOverviewDashboard(page)
    await expect(page.getByTestId('saved-login-row')).toHaveCount(1)

    await page.getByTestId('saved-login-forget').click()
    await page
      .locator('#confirm-modal-overlay')
      .getByRole('button', { name: 'Forget', exact: true })
      .click()

    await expect(page.getByTestId('saved-login-row')).toHaveCount(0)
    expect(existsSync(join(authDir(), 'admin.json'))).toBe(false)
    expect(existsSync(join(authDir(), 'admin.lock'))).toBe(true)
  })
})

test.describe('Login run options', () => {
  test.beforeEach(async ({ page }) => {
    await goToOverviewFiles(page)
    await page.getByTestId('overview-more-options').click()
  })

  test('Log in fresh applies to the next run only', async ({ electronApp, page }) => {
    await mockRunner(electronApp, quickRun)
    await page.getByTestId('overview-fresh-login').check()
    await runTests(page)
    await expect(page.getByTestId('run-phase')).toHaveText('Passed')
    await expect(page.getByTestId('overview-fresh-login')).not.toBeChecked()

    await runTests(page)
    await expect.poll(async () => (await getStartRequests(electronApp)).length).toBe(2)
    const [fresh, next] = await getStartRequests(electronApp)
    expect(fresh.loginState).toBe('refresh')
    expect(next.loginState).toBeUndefined()
  })

  test('turning off Reuse saved logins runs without them', async ({ electronApp, page }) => {
    await mockRunner(electronApp, quickRun)
    await page.getByTestId('overview-reuse-logins').click()
    await expect(page.getByTestId('overview-fresh-login')).toBeDisabled()
    await runTests(page)

    await expect.poll(async () => (await getStartRequests(electronApp)).length).toBe(1)
    expect((await getStartRequests(electronApp))[0].loginState).toBe('off')
  })
})
