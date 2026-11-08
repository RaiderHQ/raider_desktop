import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './electronApp'
import { goToNewProject, mockRubyReady } from './helpers/navigation'

test.describe('New Project Page', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await goToNewProject(page)
    // The gem version gates Create; mockRubyReady answers it (4.0.1) and reloads
    await mockRubyReady(electronApp, page)
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

  test('offers web projects only: no Website / Mobile app choice', async ({ page }) => {
    await expect(page.getByText('What are you testing?')).toHaveCount(0)
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText(/mobile/i)).toHaveCount(0)
    await expect(page.getByText('Watir')).toHaveCount(0)
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
      page.getByRole('heading', { name: 'About creating a project', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(
        "Give your project a name, choose a CI provider and add-ons, and Ruby Raider sets up a web project"
      )
    ).toBeVisible()
  })

  test('help modal can be closed', async ({ page }) => {
    const helpIcon = page.locator('button[aria-label="Help information"]')
    await helpIcon.click()
    const modalTitle = page.getByRole('heading', { name: 'About creating a project', exact: true })
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

  test('creation sends selenium and the web options', async ({ electronApp, page }) => {
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => '/mock/folder')
      ipcMain.removeHandler('run-ruby-raider')
      ipcMain.handle('run-ruby-raider', async (_event, ...args) => {
        ;(globalThis as Record<string, unknown>).__raiderArgs = args
        return { success: true, output: 'Project created successfully' }
      })
    })

    await page.getByPlaceholder('Enter project name').fill('web_project')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page).toHaveURL(/#\/overview/)
    const args = await electronApp.evaluate(
      () => (globalThis as Record<string, unknown>).__raiderArgs as unknown[]
    )
    expect(args[2]).toBe('selenium')
    expect(args[4]).toEqual({ accessibility: false, ci: 'github', examples: true })
    expect(args).toHaveLength(5)
  })

  test('says the name rule inline and keeps Create off for a name with spaces (D13)', async ({
    page
  }) => {
    const input = page.getByPlaceholder('Enter project name')
    await expect(page.getByText(/Letters, numbers, underscores and hyphens/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()

    await input.fill('ux test project')
    await expect(page.getByRole('alert')).toContainText('no spaces')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()

    await input.fill('ux_test_project')
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
  })

  test('refuses to create over an existing folder instead of waiting on raider (D4)', async ({
    electronApp,
    page
  }) => {
    // The real run-ruby-raider handler, pointed at a temp folder that already holds the name
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-e2e-'))
    fs.mkdirSync(path.join(parent, 'taken'))
    await electronApp.evaluate(async ({ ipcMain }, dir) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => dir)
    }, parent)

    await page.getByPlaceholder('Enter project name').fill('taken')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByText("Raider couldn't create the project.")).toBeVisible({
      timeout: 10000
    })
    await expect(
      page.getByText(`A folder named "taken" already exists in ${parent}.`)
    ).toBeVisible()
    await expect(page).not.toHaveURL(/#\/overview/)

    fs.rmSync(parent, { recursive: true, force: true })
  })
})
