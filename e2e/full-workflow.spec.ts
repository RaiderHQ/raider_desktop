import { test, expect } from './electronApp'
import { goToLanding, goToOverview, createSuiteViaUI, navigateTo } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockIPCCapture,
  getIPCCalls,
  setRubyCommand
} from './helpers/ipc-mock'

test.describe('User Workflows', () => {
  test('new user flow: landing -> create project form -> back', async ({ page }) => {
    await goToLanding(page)
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(800)

    await page.getByPlaceholder('Enter project name').fill('test_automation_project')
    const automationSelect = page.locator('select').first()
    await automationSelect.selectOption('Watir')

    const testSelect = page.locator('select').nth(1)
    await testSelect.selectOption('Cucumber')

    await expect(page.getByPlaceholder('Enter project name')).toHaveValue('test_automation_project')

    await page.getByRole('button', { name: 'Back' }).click()
  })

  test('with a project: the Tests tab, a suite, and a new test in it', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()

    await createSuiteViaUI(page, 'Login Tests')
    await createSuiteViaUI(page, 'Checkout Tests')
    const suite = page.getByRole('combobox', { name: 'Suite', exact: true })
    await expect(suite.locator('option:checked')).toHaveText('Checkout Tests')
    await expect(suite.locator('option').filter({ hasText: 'Login Tests' })).toHaveCount(1)

    await page.getByRole('button', { name: 'New test', exact: true }).click()
    await expect(page).toHaveURL(/#\/overview\/tests\/new$/)
    await expect(page.getByLabel('Test name')).toBeVisible()
  })

  test('quick record makes a project and opens a new test in it', async ({ page }) => {
    await setRubyCommand(page, 'ruby')
    await mockIPCCapture(page, 'createQuickProject', {
      success: true,
      projectPath: '/mock/quick-project'
    })
    await mockIPC(page, 'listProjectTests', [])
    await mockIPC(page, 'readDirectory', [])
    await mockIPC(page, 'getSuites', [])
    await goToLanding(page)

    await page.getByRole('button', { name: 'Quick record' }).click()
    const dialog = page.getByRole('dialog', { name: 'Quick record' })
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('https://example.com').fill('example.com')
    await dialog.getByPlaceholder('Checkout works').fill('Checkout works')
    await dialog.getByRole('button', { name: 'Start' }).click()

    await expect(page).toHaveURL(/#\/overview\/tests\/new$/)
    // A bare address gets https://
    expect((await getIPCCalls(page, 'createQuickProject'))[0][0]).toBe('https://example.com')
    await expect(page.getByLabel('Test name')).toHaveValue('Checkout works')
  })

  test('landing page info modals show correct content', async ({ page }) => {
    await goToLanding(page)

    const infoIcons = page.locator('button[aria-label="Help"]')
    const count = await infoIcons.count()

    if (count > 0) {
      await infoIcons.first().click()
      await page.waitForTimeout(500)
      await expect(page.getByText('Creating a New Project')).toBeVisible()
    }
  })

  test('full navigation round trip: all pages', async ({ page }) => {
    await goToLanding(page)
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByText('Create a new project')).toBeVisible()

    await page.getByRole('button', { name: 'Back' }).click()
    await page.waitForTimeout(500)

    await setupProjectContext(page)
    await navigateTo(page, '/overview')
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()

    await navigateTo(page, '/overview/tests/new')
    await expect(page.getByLabel('Test name')).toBeVisible()
  })
})
