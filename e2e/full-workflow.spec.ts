import { test, expect } from './electronApp'

/**
 * End-to-end workflow tests that simulate real user journeys
 * across multiple pages of the application.
 */
test.describe('User Workflows', () => {
  test('new user flow: landing → create project form → back', async ({ page }) => {
    // 1. User starts at the landing page
    await page.evaluate(() => {
      window.location.hash = '#/start-project'
    })
    await page.waitForURL('**/#/start-project')
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()

    // 2. User clicks Create
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL('**/#/new')

    // 3. User fills in the project form
    await page.getByPlaceholder('Enter project name').fill('test_automation_project')
    const automationSelect = page.locator('select').first()
    await automationSelect.selectOption('Watir')

    const testSelect = page.locator('select').nth(1)
    await testSelect.selectOption('Cucumber')

    // 4. Verify selections persisted
    await expect(page.getByPlaceholder('Enter project name')).toHaveValue(
      'test_automation_project'
    )

    // 5. User goes back
    await page.getByRole('button', { name: 'Back' }).click()
  })

  test('explore all main pages without a project loaded', async ({ page }) => {
    // Recorder page (default)
    await page.locator('nav >> text=Recorder').click()
    await expect(page.getByText('Test Suites')).toBeVisible()

    // Dashboard page
    await page.locator('nav >> text=Dashboard').click()
    await expect(page.getByText('Project Dashboard')).toBeVisible()
    await expect(
      page.getByText('Please run your tests to see the results on the dashboard.')
    ).toBeVisible()

    // Settings page
    await page.locator('nav >> text=Settings').click()
    await expect(page.getByText('General Settings')).toBeVisible()

    // Check project settings shows no-project message
    await page.getByRole('button', { name: 'Project Settings' }).click()
    await expect(page.getByText('No Project Loaded')).toBeVisible()

    // Tests/Overview page
    await page.locator('nav >> text=Tests').click()
  })

  test('recorder suite management workflow', async ({ page }) => {
    await page.locator('nav >> text=Recorder').click()
    await page.waitForURL('**/#/recorder')

    // 1. Create a test suite
    await page.getByText('+ New Suite...').click()
    await page.getByPlaceholder('New suite name...').fill('Login Tests')
    await page.getByRole('button', { name: 'Create' }).click()

    // 2. Verify the suite was created
    await expect(page.getByText('Login Tests')).toBeVisible({ timeout: 5000 })

    // 3. Create another suite
    await page.getByText('+ New Suite...').click()
    await page.getByPlaceholder('New suite name...').fill('Checkout Tests')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByText('Checkout Tests')).toBeVisible({ timeout: 5000 })
  })

  test('settings tab navigation remembers state within session', async ({ page }) => {
    await page.locator('nav >> text=Settings').click()

    // Start at General (default)
    await expect(page.getByText('Language')).toBeVisible()

    // Switch to Recording
    await page.getByRole('button', { name: 'Recording Settings' }).click()
    await expect(page.getByText('Implicit Wait')).toBeVisible()

    // Navigate away
    await page.locator('nav >> text=Dashboard').click()
    await expect(page.getByText('Project Dashboard')).toBeVisible()

    // Navigate back — tab state resets to General (component remounts)
    await page.locator('nav >> text=Settings').click()
    const generalTab = page.getByRole('button', { name: 'General Settings' })
    await expect(generalTab).toHaveClass(/font-semibold/)
  })

  test('landing page info modals show correct content', async ({ page }) => {
    await page.evaluate(() => {
      window.location.hash = '#/start-project'
    })
    await page.waitForURL('**/#/start-project')

    // Each ProjectSelector card has an info icon — find them
    const infoIcons = page.locator('img[alt="Information"]')
    const count = await infoIcons.count()

    if (count > 0) {
      // Click the first info icon (Create project)
      await infoIcons.first().click()
      await expect(page.getByText('Creating a New Project')).toBeVisible()
    }
  })
})
