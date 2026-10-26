import { test, expect } from './electronApp'
import { goToNewProject, dismissRubyModals } from './helpers/navigation'

test.describe('New Project Page', () => {
  test.beforeEach(async ({ page }) => {
    await goToNewProject(page)
    await dismissRubyModals(page)
  })

  test('shows create project title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create a new project' })).toBeVisible()
  })

  test('shows subtitle instructions', async ({ page }) => {
    await expect(
      page.getByText('To create a project, first you need to select the following')
    ).toBeVisible()
  })

  test('shows project name input field', async ({ page }) => {
    const input = page.getByPlaceholder('Enter project name')
    await expect(input).toBeVisible()
    await expect(input).toBeEditable()
  })

  test('can type a project name', async ({ page }) => {
    const input = page.getByPlaceholder('Enter project name')
    await input.fill('my_test_project')
    await expect(input).toHaveValue('my_test_project')
  })

  test('shows automation framework dropdown', async ({ page }) => {
    await expect(page.getByText('Select your automation framework')).toBeVisible()
  })

  test('shows test framework dropdown', async ({ page }) => {
    await expect(page.getByText('Select your test framework')).toBeVisible()
  })

  test('automation dropdown has correct options', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    const options = automationSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Selenium')
    expect(optionTexts).toContain('Watir')
    expect(optionTexts).not.toContain('Capybara')
    expect(optionTexts).not.toContain('Appium')
  })

  test('test framework dropdown has correct options', async ({ page }) => {
    const testSelect = page.locator('select').nth(1)
    const options = testSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Rspec')
    expect(optionTexts).toContain('Cucumber')
    expect(optionTexts).not.toContain('Minitest')
  })

  test('shows Back and Create buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('Back button navigates away from new project page', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).not.toHaveURL(/#\/new/)
  })

  test('shows help icon that opens info modal', async ({ page }) => {
    const helpIcon = page.locator('button[aria-label="Help information"]')
    await expect(helpIcon).toBeVisible()

    await helpIcon.click()
    await expect(
      page.getByRole('heading', { name: 'Create a New Project', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Choose your automation framework (Selenium is the most common')
    ).toBeVisible()
  })

  test('help modal can be closed', async ({ page }) => {
    const helpIcon = page.locator('button[aria-label="Help information"]')
    await helpIcon.click()
    const modalTitle = page.getByRole('heading', { name: 'Create a New Project', exact: true })
    await expect(modalTitle).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(modalTitle).not.toBeVisible()
  })

  test('Create button triggers folder selection and project creation', async ({
    electronApp,
    page
  }) => {
    // window.api is frozen by the contextBridge, so mock at the main process level
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => '/mock/folder')
      ipcMain.removeHandler('run-ruby-raider')
      ipcMain.handle('run-ruby-raider', async () => ({
        success: true,
        output: 'Project created successfully'
      }))
    })

    await page.getByPlaceholder('Enter project name').fill('test_project')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // A successful creation opens the new project's Overview
    await expect(page).toHaveURL(/#\/overview/)
  })

  test('all automation framework options can be selected', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    const frameworks = ['Selenium', 'Watir']

    for (const fw of frameworks) {
      await automationSelect.selectOption(fw)
      await expect(automationSelect).toHaveValue(fw)
    }
  })

  test('all test framework options can be selected', async ({ page }) => {
    const testSelect = page.locator('select').nth(1)
    const frameworks = ['Rspec', 'Cucumber']

    for (const fw of frameworks) {
      await testSelect.selectOption(fw)
      await expect(testSelect).toHaveValue(fw)
    }
  })
})
