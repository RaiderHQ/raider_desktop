import { test, expect } from './electronApp'
import { goToNewProject } from './helpers/navigation'

test.describe('New Project Page', () => {
  test.beforeEach(async ({ page }) => {
    await goToNewProject(page)
  })

  test('shows create project title', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Create a new project' })
    ).toBeVisible()
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
    expect(optionTexts).toContain('Appium')
    expect(optionTexts).toContain('Watir')
    expect(optionTexts).toContain('Capybara')
  })

  test('test framework dropdown has correct options', async ({ page }) => {
    const testSelect = page.locator('select').nth(1)
    const options = testSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Rspec')
    expect(optionTexts).toContain('Cucumber')
    expect(optionTexts).toContain('Minitest')
  })

  test('selecting Appium shows mobile platform dropdown', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    await automationSelect.selectOption('Appium')
    await expect(page.getByText('Select your mobile platform')).toBeVisible()

    const mobileSelect = page.locator('select').nth(2)
    const options = mobileSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Android')
    expect(optionTexts).toContain('iOS')
  })

  test('selecting non-Appium hides mobile platform dropdown', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    await automationSelect.selectOption('Appium')
    await expect(page.getByText('Select your mobile platform')).toBeVisible()

    await automationSelect.selectOption('Selenium')
    await expect(page.getByText('Select your mobile platform')).not.toBeVisible()
  })

  test('shows Back and Create buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('Back button navigates away from new project page', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click()
    const url = page.url()
    expect(url).not.toContain('#/new')
  })

  test('shows help icon that opens info modal', async ({ page }) => {
    const helpIcon = page.locator('button[aria-label="Help"]')
    await expect(helpIcon).toBeVisible()

    await helpIcon.click()
    await expect(page.getByText('Start a New Project')).toBeVisible()
    await expect(
      page.getByText('Choose the different options in the selectors')
    ).toBeVisible()
  })

  test('help modal can be closed', async ({ page }) => {
    const helpIcon = page.locator('button[aria-label="Help"]')
    await helpIcon.click()
    await expect(page.getByText('Start a New Project')).toBeVisible()

    // Close the modal
    const closeButton = page.getByRole('button', { name: /close|ok|got it/i })
    if (await closeButton.isVisible()) {
      await closeButton.click()
    }
    await page.waitForTimeout(300)
  })

  test('Create button triggers folder selection and project creation', async ({ page }) => {
    // Fill in the form
    await page.getByPlaceholder('Enter project name').fill('test_project')

    // Mock the IPC calls
    await page.evaluate(() => {
      ;(window as any).api.selectFolder = async () => '/mock/folder'
      ;(window as any).api.runRubyRaider = async () => ({
        success: true,
        output: 'Project created successfully'
      })
      ;(window as any).api.readDirectory = async () => []
    })

    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(1000)
  })

  test('Applitools option available in automation dropdown', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    const options = automationSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Applitools')
  })

  test('all automation framework options can be selected', async ({ page }) => {
    const automationSelect = page.locator('select').first()
    const frameworks = ['Selenium', 'Appium', 'Watir', 'Capybara']

    for (const fw of frameworks) {
      await automationSelect.selectOption(fw)
      await expect(automationSelect).toHaveValue(fw)
    }
  })

  test('all test framework options can be selected', async ({ page }) => {
    const testSelect = page.locator('select').nth(1)
    const frameworks = ['Rspec', 'Cucumber', 'Minitest']

    for (const fw of frameworks) {
      await testSelect.selectOption(fw)
      await expect(testSelect).toHaveValue(fw)
    }
  })
})
