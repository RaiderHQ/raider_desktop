import { test, expect } from './electronApp'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the landing/start-project page
    await page.evaluate(() => {
      window.location.hash = '#/start-project'
    })
    await page.waitForURL('**/#/start-project')
  })

  test('shows welcome title', async ({ page }) => {
    await expect(page.getByText('Welcome to Ruby Raider!')).toBeVisible()
  })

  test('shows subtitle description', async ({ page }) => {
    await expect(
      page.getByText('It is a gem that provides a generator and scaffolding')
    ).toBeVisible()
  })

  test('shows Ruby Raider logo', async ({ page }) => {
    const logo = page.locator('img[alt="Ruby Raider Logo"]')
    await expect(logo).toBeVisible()
  })

  test('shows Create project option', async ({ page }) => {
    await expect(page.getByText('Create a new project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('shows Open project option', async ({ page }) => {
    await expect(page.getByText('Open existing project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
  })

  test('shows Adopt project option', async ({ page }) => {
    await expect(page.getByText('Adopt existing project')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Adopt' })).toBeVisible()
  })

  test('clicking Create navigates to new project page', async ({ page }) => {
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL('**/#/new')

    await expect(page.getByText('Create a new project')).toBeVisible()
  })

  test('clicking Adopt navigates to adopt page', async ({ page }) => {
    await page.getByRole('button', { name: 'Adopt' }).click()
    await page.waitForURL('**/#/adopt')

    await expect(page.getByText('Adopt a Project')).toBeVisible()
  })
})
