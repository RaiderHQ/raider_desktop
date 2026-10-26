import { test, expect } from './electronApp'
import {
  goToLanding,
  goToRecorder,
  createSuiteViaUI,
  enterMainLayout,
  dismissRubyModals
} from './helpers/navigation'
import { mockIPC, mockIPCSync } from './helpers/ipc-mock'

test.describe('User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await dismissRubyModals(page)
  })

  test('new user flow: landing -> create project form -> back', async ({ page }) => {
    await goToLanding(page)
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForTimeout(800)

    await page.getByPlaceholder('Enter project name').fill('test_automation_project')
    const automationSelect = page.locator('select').first()
    await automationSelect.selectOption('Watir')

    const testSelect = page.locator('select').nth(1)
    await testSelect.selectOption('Cucumber')

    await expect(page.getByPlaceholder('Enter project name')).toHaveValue('test_automation_project')

    await page.getByRole('button', { name: 'Back' }).click()
  })

  test('explore all main pages once a project is open', async ({ electronApp, page }) => {
    await enterMainLayout(electronApp, page)
    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()

    await page.locator('a[href="#/overview"]').click()
    await page.waitForTimeout(500)
  })

  test('recorder suite management workflow', async ({ page }) => {
    await goToRecorder(page)

    await createSuiteViaUI(page, 'Login Tests')
    await expect(page.getByRole('heading', { name: 'Suite: Login Tests' })).toBeVisible()

    await createSuiteViaUI(page, 'Checkout Tests')
    await expect(page.getByRole('heading', { name: 'Suite: Checkout Tests' })).toBeVisible()

    // The suite selector lists both suites, with the last created one selected
    const suiteSelect = page.locator('select[aria-label="Select a Suite"]')
    const options = await suiteSelect.locator('option').allTextContents()
    expect(options).toContain('Login Tests')
    expect(options).toContain('Checkout Tests')
    await expect(suiteSelect.locator('option:checked')).toHaveText('Checkout Tests')
  })

  test('recorder tab navigation and state', async ({ page }) => {
    // Mock IPC methods used on Recorder mount
    await mockIPC(page, 'getSuites', [])
    await mockIPCSync(page, 'onTestRunStatus')
    await mockIPCSync(page, 'removeTestRunStatusListener')
    await goToRecorder(page)
    await page.waitForTimeout(500)

    // The wait settings now live on the Recording tab (there is no Settings tab)
    await expect(page.getByText('Implicit Wait')).toBeVisible()

    // Switch to Dashboard tab
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    await dashboardTab.click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Implicit Wait')).not.toBeVisible()
    await expect(page.getByText('No recording results yet')).toBeVisible()

    // Switch back to Recording tab
    const recordingTab = page.locator('button').filter({ hasText: 'Recording' }).first()
    await recordingTab.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
    await expect(page.getByText('Implicit Wait')).toBeVisible()
  })

  test('landing page info modals show correct content', async ({ page }) => {
    await goToLanding(page)

    // Cards are ordered Recorder, Create, Open
    const infoIcons = page.locator('button[aria-label="Help"]')
    await expect(infoIcons).toHaveCount(3)

    await infoIcons.nth(1).click()
    await expect(page.getByRole('heading', { name: 'Creating a New Project' })).toBeVisible()
    await expect(
      page.getByText('Here you can create a new project and start automating your tests.')
    ).toBeVisible()
  })

  test('full navigation round trip: all pages', async ({ electronApp, page }) => {
    await goToLanding(page)
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('heading', { name: 'Create a new project' })).toBeVisible()

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    await enterMainLayout(electronApp, page)
    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()

    await page.locator('a[href="#/overview"]').click()
    await page.waitForTimeout(500)
  })

  test('multiple suites can be created and are all visible', async ({ page }) => {
    await goToRecorder(page)

    await createSuiteViaUI(page, 'Suite A')
    await createSuiteViaUI(page, 'Suite B')
    await createSuiteViaUI(page, 'Suite C')

    // The active suite (last created) is shown in dropdown button
    await expect(page.getByRole('heading', { name: 'Suite: Suite C' })).toBeVisible()

    // The suite selector lists every suite
    const suiteSelect = page.locator('select[aria-label="Select a Suite"]')
    const options = await suiteSelect.locator('option').allTextContents()
    expect(options).toEqual(expect.arrayContaining(['Suite A', 'Suite B', 'Suite C']))
  })
})
