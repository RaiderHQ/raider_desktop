import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { mockIPC, setProjectPath } from './helpers/ipc-mock'

// Mobile (Appium) projects are not supported in this version: opening one shows a single
// message in place of the project, and main refuses to run it. Main detects it from the
// real Gemfile here, so nothing about the layout is mocked.
let projectPath: string

test.beforeEach(async ({ electronApp, page }) => {
  // The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
  await mockRubyReady(electronApp, page)
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-appium-'))
  fs.writeFileSync(
    path.join(projectPath, 'Gemfile'),
    "source 'https://rubygems.org'\ngem 'appium_lib'\ngem 'rspec'\ngem 'ruby_raider', '~> 4.0'\n"
  )
  fs.mkdirSync(path.join(projectPath, 'spec'))
  fs.writeFileSync(path.join(projectPath, 'spec', 'login_spec.rb'), "describe 'Login' do\nend\n")
  await mockIPC(page, 'readDirectory', [])
  await mockIPC(page, 'listProjectTests', [])
  await setProjectPath(page, projectPath)
  await goToOverview(page)
})

test.afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
})

test.describe('Mobile (Appium) project', () => {
  test('shows one not-supported message in place of the project', async ({ page }) => {
    const alert = page.getByTestId('mobile-project-unsupported')
    await expect(alert).toBeVisible({ timeout: 20000 })
    await expect(alert).toContainText('Mobile projects are not supported')
    await expect(alert).toContainText('works with web projects only')
    for (const tab of ['Tests', 'Files', 'Dashboard']) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toHaveCount(0)
    }
    await expect(page.getByTitle('Run tests')).toHaveCount(0)
  })

  test('Open another project goes back to the start page', async ({ page }) => {
    await expect(page.getByTestId('mobile-project-unsupported')).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Open another project' }).click()
    await expect(page).toHaveURL(/#\/start-project/)
  })

  test('main refuses to run it', async ({ page }) => {
    await expect(page.getByTestId('mobile-project-unsupported')).toBeVisible({ timeout: 20000 })
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          api: { startRun: (r: unknown) => Promise<unknown> }
        }
      ).api.startRun({ scope: { kind: 'all' }, rubyCommand: 'ruby' })
    )
    expect(result).toEqual({ error: 'Mobile projects are not supported in this version.' })
  })
})
