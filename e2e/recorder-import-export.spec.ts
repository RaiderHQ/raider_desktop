import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview, createSuiteViaUI } from './helpers/navigation'
import { setupProjectContext, mockIPCCapture, getIPCCalls } from './helpers/ipc-mock'

// Import and export sit in the suite actions menu above the Tests list
const openMenu = (page: Page): Promise<void> =>
  page.getByRole('button', { name: 'Suite actions' }).click()

test.describe('Tests list import/export', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
  })

  test('the menu offers every import and export', async ({ page }) => {
    await openMenu(page)
    for (const name of [
      'Import test',
      'Import suite',
      'Import project',
      'Export suite',
      'Export project'
    ]) {
      await expect(page.getByRole('menuitem', { name })).toBeVisible()
    }
  })

  test('Export suite needs a suite', async ({ page }) => {
    await openMenu(page)
    await expect(page.getByRole('menuitem', { name: 'Export suite' })).toBeDisabled()
  })

  test('export suite sends the selected suite and says where it went', async ({ page }) => {
    await createSuiteViaUI(page, 'IE Suite')
    await mockIPCCapture(page, 'exportSuite', { success: true, path: '/mock/export/suite.json' })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Export suite' }).click()

    await expect(page.getByText('Suite exported to /mock/export/suite.json')).toBeVisible()
    const calls = await getIPCCalls(page, 'exportSuite')
    expect(calls).toHaveLength(1)
    const selected = await page.getByRole('combobox', { name: 'Suite', exact: true }).inputValue()
    expect(calls[0]).toEqual([selected])
  })

  test('a failed export says why', async ({ page }) => {
    await mockIPCCapture(page, 'exportProject', { success: false, error: 'No suites to export' })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Export project' }).click()
    await expect(page.getByText(/No suites to export/)).toBeVisible()
  })

  test('import test with all tests listed imports outside any suite', async ({ page }) => {
    await mockIPCCapture(page, 'importTest', { success: true })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Import test' }).click()
    await expect(page.getByText('Test imported successfully!')).toBeVisible()
    const calls = await getIPCCalls(page, 'importTest')
    expect(calls).toEqual([['not-in-a-suite']])
  })
})
