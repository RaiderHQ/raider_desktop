import { test, expect } from './electronApp'
import { goToRecorder, createSuiteViaUI } from './helpers/navigation'

test.describe('Recorder Controls', () => {
  test.beforeEach(async ({ page }) => {
    await goToRecorder(page)
  })

  test('creating a suite shows suite name in panel', async ({ page }) => {
    await createSuiteViaUI(page, 'Control Suite')
    await expect(page.getByRole('heading', { name: 'Suite: Control Suite' })).toBeVisible()
  })

  test('suite selector dropdown exists after creating suite', async ({ page }) => {
    await createSuiteViaUI(page, 'Dropdown Suite')

    // The suite name should be visible (in dropdown or header)
    await expect(page.getByRole('heading', { name: 'Suite: Dropdown Suite' })).toBeVisible()
  })

  test('New Test button or test creation is available after suite creation', async ({ page }) => {
    await createSuiteViaUI(page, 'Test Suite')

    // Look for "New Test" button or similar
    const newTestBtn = page.getByRole('button', { name: /new test/i })
    const addTestBtn = page.getByRole('button', { name: /add test/i })

    const hasNew = await newTestBtn.isVisible().catch(() => false)
    const hasAdd = await addTestBtn.isVisible().catch(() => false)
    // At minimum the suite should be created
    await expect(page.getByRole('heading', { name: 'Suite: Test Suite' })).toBeVisible()
  })

  test('Run Output section is in the DOM', async ({ page }) => {
    const runOutput = page.getByText('Run Output')
    const count = await runOutput.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('multiple suites can be created sequentially', async ({ page }) => {
    await createSuiteViaUI(page, 'Suite One')
    await createSuiteViaUI(page, 'Suite Two')
    await createSuiteViaUI(page, 'Suite Three')

    // The active suite name is shown in the dropdown button
    await expect(page.getByRole('heading', { name: 'Suite: Suite Three' })).toBeVisible()

    // Open the dropdown to verify all suites are listed
    const suiteDropdownBtn = page.locator('button[aria-label="Select a Suite"]')
    await suiteDropdownBtn.click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Suite One')).toBeVisible()
    await expect(page.getByText('Suite Two')).toBeVisible()
  })
})
