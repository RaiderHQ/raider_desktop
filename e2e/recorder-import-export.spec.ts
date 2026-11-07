import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setupProjectContext, mockIPCCapture, getIPCCalls } from './helpers/ipc-mock'

// Import and export sit in the More menu above the Tests list
const openMenu = (page: Page): Promise<void> =>
  page.getByRole('button', { name: 'More test actions' }).click()

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Tests list import/export', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
  })

  test('the menu offers every import and export', async ({ page }) => {
    await openMenu(page)
    for (const name of ['Run tagged tests', 'Import test', 'Import project', 'Export project']) {
      await expect(page.getByRole('menuitem', { name })).toBeVisible()
    }
    for (const name of ['Import suite', 'Export suite']) {
      await expect(page.getByRole('menuitem', { name })).toHaveCount(0)
    }
  })

  test('export project says where it went', async ({ page }) => {
    await mockIPCCapture(page, 'exportProject', { success: true, path: '/mock/export/project' })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Export project' }).click()
    await expect(page.getByText('Project exported to /mock/export/project')).toBeVisible()
    expect(await getIPCCalls(page, 'exportProject')).toHaveLength(1)
  })

  test('a failed export says why', async ({ page }) => {
    await mockIPCCapture(page, 'exportProject', { success: false, error: 'No tests to export' })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Export project' }).click()
    await expect(page.getByText(/No tests to export/)).toBeVisible()
  })

  test('import test sends no suite', async ({ page }) => {
    await mockIPCCapture(page, 'importTest', { success: true })
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Import test' }).click()
    await expect(page.getByText('Test imported successfully!')).toBeVisible()
    expect(await getIPCCalls(page, 'importTest')).toEqual([[]])
  })
})
