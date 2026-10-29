import { test, expect } from './electronApp'
import { goToOverview, createSuiteViaUI } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'

// Suites are managed above the Tests list. Creating one goes through the real main
// process, which broadcasts the new suites back to the window.
test.describe('Suites on the Tests list', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
  })

  const suiteSelect = (page: import('@playwright/test').Page) =>
    page.getByRole('combobox', { name: 'Suite', exact: true })

  test('lists all tests until a suite is picked', async ({ page }) => {
    await expect(suiteSelect(page).locator('option:checked')).toHaveText('All tests')
  })

  test('creating a suite selects it', async ({ page }) => {
    await createSuiteViaUI(page, 'Control Suite')
    await expect(suiteSelect(page).locator('option:checked')).toHaveText('Control Suite')
  })

  test('multiple suites can be created and are all offered', async ({ page }) => {
    await createSuiteViaUI(page, 'Suite One')
    await createSuiteViaUI(page, 'Suite Two')
    await createSuiteViaUI(page, 'Suite Three')

    await expect(suiteSelect(page).locator('option:checked')).toHaveText('Suite Three')
    const options = suiteSelect(page).locator('option')
    await expect(options.filter({ hasText: 'Suite One' })).toHaveCount(1)
    await expect(options.filter({ hasText: 'Suite Two' })).toHaveCount(1)
  })

  test('Run suite needs a suite', async ({ page }) => {
    await page.getByRole('button', { name: 'Suite actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Run suite' })).toBeDisabled()
    // The menu button toggles the menu closed again
    await page.getByRole('button', { name: 'Suite actions' }).click()

    await createSuiteViaUI(page, 'Runnable Suite')
    await page.getByRole('button', { name: 'Suite actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Run suite' })).toBeEnabled()
  })
})
