import { test, expect } from './electronApp'
import { goToNewProject, goToLanding } from './helpers/navigation'

test.describe('Minitest Support', () => {
  test('Minitest is available in the New Project test framework dropdown', async ({ page }) => {
    await goToNewProject(page)

    const testSelect = page.locator('select').nth(1)
    const options = testSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('Minitest')
  })

  test('can select Minitest as test framework when creating a project', async ({ page }) => {
    await goToNewProject(page)

    const testSelect = page.locator('select').nth(1)
    await testSelect.selectOption('Minitest')
    await expect(testSelect).toHaveValue('Minitest')

    // Fill in project name to verify full form works with Minitest selected
    await page.getByPlaceholder('Enter project name').fill('minitest_project')
    await expect(page.getByPlaceholder('Enter project name')).toHaveValue('minitest_project')
  })

  test('Minitest project creation form submits with mocked IPC', async ({ page }) => {
    await goToNewProject(page)

    await page.getByPlaceholder('Enter project name').fill('minitest_test_project')
    const testSelect = page.locator('select').nth(1)
    await testSelect.selectOption('Minitest')

    // Mock the IPC calls
    await page.evaluate(() => {
      ;(window as any).api.selectFolder = async () => '/mock/folder'
      ;(window as any).api.runRubyRaider = async (
        _folder: string,
        _name: string,
        framework: string
      ) => {
        // Verify minitest is passed as the framework
        if (framework !== 'minitest') {
          return { success: false, error: `Expected minitest but got ${framework}` }
        }
        return { success: true, output: 'Project created successfully' }
      }
      ;(window as any).api.readDirectory = async () => []
    })

    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(1500)
  })
})
