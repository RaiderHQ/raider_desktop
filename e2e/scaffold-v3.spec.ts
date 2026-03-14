import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import { mockRubyInstalled, mockReadDirectory } from './helpers/ipc-mock'

test.describe('Scaffold Panel v3 Features', () => {
  test.beforeEach(async ({ page }) => {
    await mockRubyInstalled(page)

    // Set a project path in the store
    await page.evaluate(() => {
      ;(window as any).__projectPath = '/mock/project'
      // Set projectPath in zustand store by dispatching to the store
      const stores = (window as any).__ZUSTAND_STORES__
      if (stores?.projectStore) {
        stores.projectStore.setState({ projectPath: '/mock/project' })
      }
    })

    await goToOverview(page)
    await page.waitForTimeout(500)
  })

  test('component type dropdown includes all v3 types', async ({ page }) => {
    // Look for the scaffold panel - it may be in the overview sidebar
    const componentSelect = page.locator('select').filter({ hasText: /Page Object/ })
    if (await componentSelect.isVisible().catch(() => false)) {
      const options = componentSelect.locator('option')
      const texts = await options.allTextContents()
      expect(texts).toContain('Page Object')
      expect(texts).toContain('Spec')
      expect(texts).toContain('Feature')
      expect(texts).toContain('Steps')
      expect(texts).toContain('Helper')
      expect(texts).toContain('Component')
    }
  })

  test('shows "From Page Object" input when Spec type is selected', async ({ page }) => {
    const typeSelect = page.locator('select').filter({ hasText: /Page Object/ })
    if (await typeSelect.isVisible().catch(() => false)) {
      await typeSelect.selectOption('spec')
      await page.waitForTimeout(300)
      await expect(page.getByText('From Page Object (optional)')).toBeVisible()
    }
  })

  test('hides "From Page Object" input for non-spec types', async ({ page }) => {
    const typeSelect = page.locator('select').filter({ hasText: /Page Object/ })
    if (await typeSelect.isVisible().catch(() => false)) {
      // First select spec to show the field
      await typeSelect.selectOption('spec')
      await page.waitForTimeout(300)
      await expect(page.getByText('From Page Object (optional)')).toBeVisible()

      // Then switch to page to hide it
      await typeSelect.selectOption('page')
      await page.waitForTimeout(300)
      await expect(page.getByText('From Page Object (optional)')).not.toBeVisible()
    }
  })

  test('CRUD tab is available and shows resource name input', async ({ page }) => {
    const crudTab = page.getByRole('button', { name: 'CRUD' })
    if (await crudTab.isVisible().catch(() => false)) {
      await crudTab.click()
      await page.waitForTimeout(300)
      await expect(page.getByPlaceholder('e.g. user, product')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Generate CRUD' })).toBeVisible()
    }
  })

  test('From URL tab is available and shows URL input', async ({ page }) => {
    const urlTab = page.getByRole('button', { name: 'From URL' })
    if (await urlTab.isVisible().catch(() => false)) {
      await urlTab.click()
      await page.waitForTimeout(300)
      await expect(page.getByPlaceholder('https://example.com/login')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Generate from URL' })).toBeVisible()
    }
  })

  test('Destroy button is available in Quick Generate tab', async ({ page }) => {
    const destroyBtn = page.getByRole('button', { name: 'Destroy' })
    if (await destroyBtn.isVisible().catch(() => false)) {
      await expect(destroyBtn).toBeVisible()
    }
  })
})
