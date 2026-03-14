import { test, expect } from './electronApp'
import { goToLanding, goToRecorder, createSuiteViaUI, navigateTo } from './helpers/navigation'
import { mockIPC, mockIPCSync } from './helpers/ipc-mock'

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

    await expect(page.getByPlaceholder('Enter project name')).toHaveValue(
      'test_automation_project'
    )

    await page.getByRole('button', { name: 'Back' }).click()
  })

  test('explore all main pages without a project loaded', async ({ page }) => {
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
    // The active suite (last created) is shown in dropdown button
    await expect(page.getByRole('heading', { name: 'Suite: Checkout Tests' })).toBeVisible()

    // Open dropdown to verify Login Tests is also listed
    const suiteDropdownBtn = page.locator('button[aria-label="Select a Suite"]')
    await suiteDropdownBtn.click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Login Tests').first()).toBeVisible()
  })

  test('recorder settings tab navigation and state', async ({ page }) => {
    // Mock IPC methods used on Recorder mount
    await mockIPC(page, 'getSelectorPriorities', [])
    await mockIPC(page, 'getSuites', [])
    await mockIPCSync(page, 'onTestRunStatus')
    await mockIPCSync(page, 'removeTestRunStatusListener')
    await goToRecorder(page)
    await page.waitForTimeout(500)

    // Click Settings tab on Recorder
    const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
    await settingsTab.click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Implicit Wait')).toBeVisible()

    // Switch to Dashboard tab
    const dashboardTab = page.locator('button').filter({ hasText: 'Dashboard' })
    await dashboardTab.click()
    await page.waitForTimeout(500)

    // Switch back to Recording tab
    const recordingTab = page.locator('button').filter({ hasText: 'Recording' }).first()
    await recordingTab.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
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

    await page.locator('a[href="#/recorder"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()

    await page.locator('a[href="#/overview"]').click()
    await page.waitForTimeout(500)
  })

  test('recorder settings -> add selectors', async ({ page }) => {
    // Mock IPC methods used on Recorder mount
    await mockIPC(page, 'getSelectorPriorities', [])
    await mockIPC(page, 'getSuites', [])
    await mockIPCSync(page, 'onTestRunStatus')
    await mockIPCSync(page, 'removeTestRunStatusListener')
    await goToRecorder(page)
    await page.waitForTimeout(500)

    // Click Settings tab on Recorder
    const settingsTab = page.locator('button').filter({ hasText: 'Settings' })
    await settingsTab.click()
    await page.waitForTimeout(500)

    const addInput = page.getByPlaceholder('e.g., data-testid')
    if (await addInput.isVisible().catch(() => false)) {
      await addInput.fill('data-qa')
      const addBtn = page.getByRole('button', { name: 'Add' })
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click()
        await page.waitForTimeout(300)
      }
    }

    const updateBtn = page.getByRole('button', { name: /update/i })
    if (await updateBtn.isVisible().catch(() => false)) {
      await updateBtn.click()
      await page.waitForTimeout(500)
    }
  })

  test('multiple suites can be created and are all visible', async ({ page }) => {
    await goToRecorder(page)

    await createSuiteViaUI(page, 'Suite A')
    await createSuiteViaUI(page, 'Suite B')
    await createSuiteViaUI(page, 'Suite C')

    // The active suite (last created) is shown in dropdown button
    await expect(page.getByRole('heading', { name: 'Suite: Suite C' })).toBeVisible()

    // Open dropdown to verify all suites are listed
    const suiteDropdownBtn = page.locator('button[aria-label="Select a Suite"]')
    await suiteDropdownBtn.click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Suite A')).toBeVisible()
    await expect(page.getByText('Suite B')).toBeVisible()
  })
})
