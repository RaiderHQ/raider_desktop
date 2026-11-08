import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './electronApp'
import { goToNewProject, mockRubyReady } from './helpers/navigation'

// The whole product on the real gem: `raider new` through the New page, a recording
// against the gem's own test site, a run from the Tests tab with the installed
// ruby_raider 4.x and raider_reporter 1.x, and the trace that run wrote.
//
// Opt-in: it needs Ruby with ruby_raider >= 4.0 installed, Chrome, and the network.
//   RAIDER_REAL_GEM=1 npx playwright test e2e/real-gem.spec.ts
// The first run also installs the project's gems (bundle), so give it minutes.

const REAL = process.env.RAIDER_REAL_GEM === '1'
const SITE = 'https://raider-test-site.onrender.com'
const LOGIN_URL = `${SITE}/index.php?rt=account/login`
const PROJECT = 'raider_e2e'

// The recorded password field becomes a secret step that reads RAIDER_SECRET_1 at run time;
// the app inherits this process's environment, like a user's shell would provide it.
process.env.RAIDER_SECRET_1 = '12341234'
// A passing test keeps its trace only when asked; the run below opens it
process.env.TRACE = 'on'

test.describe('Real gem', () => {
  test.skip(!REAL, 'set RAIDER_REAL_GEM=1 to run against the installed ruby_raider')
  test.setTimeout(15 * 60_000)

  let folder: string

  test.beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-real-gem-'))
  })

  test.afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  async function waitForRecorderPage(app: ElectronApplication, url: string): Promise<void> {
    await expect
      .poll(
        () =>
          app.evaluate(({ webContents }, u) => {
            const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
            return Boolean(guest && guest.getURL() === u && !guest.isLoading())
          }, url),
        { timeout: 60_000 }
      )
      .toBe(true)
  }

  // Runs in the page being recorded; the recorder's preload sees the resulting DOM events
  async function inRecorder(app: ElectronApplication, script: string): Promise<void> {
    await app.evaluate(async ({ webContents }, js) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
      await guest!.executeJavaScript(js)
    }, script)
  }

  const typeInto = (selector: string, value: string): string =>
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      el.focus(); el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('change', { bubbles: true })); })()`

  async function createProject(app: ElectronApplication, page: Page): Promise<string> {
    await goToNewProject(page)
    await page.getByPlaceholder('Enter project name').fill(PROJECT)
    await app.evaluate(async ({ ipcMain }, dir) => {
      ipcMain.removeHandler('select-folder')
      ipcMain.handle('select-folder', async () => dir)
    }, folder)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    // raider new writes the project; the app then opens it
    await expect(page).toHaveURL(/#\/overview/, { timeout: 180_000 })
    const projectPath = path.join(folder, PROJECT)
    const gemfile = fs.readFileSync(path.join(projectPath, 'Gemfile'), 'utf-8')
    expect(gemfile).toMatch(/gem 'ruby_raider', '~> 4\.\d+'/)
    expect(gemfile).toMatch(/gem 'raider_reporter', '~> 1\.\d+'/)
    return projectPath
  }

  test('create, record, run and open the trace on ruby_raider 4', async ({ electronApp, page }) => {
    // The real gem answers raider version here
    await mockRubyReady(electronApp, page, { gemVersion: null })
    const projectPath = await createProject(electronApp, page)

    // Record the login against the gem's test site
    await page.getByRole('button', { name: 'New test', exact: true }).click()
    await page.getByLabel('Test name').fill('Login')
    await page.getByLabel('Start URL').fill(LOGIN_URL)
    await page.getByRole('button', { name: 'Start recording' }).click()
    await waitForRecorderPage(electronApp, LOGIN_URL)

    await inRecorder(electronApp, typeInto('#loginFrm_loginname', 'aguspe'))
    await inRecorder(electronApp, typeInto('#loginFrm_password', '12341234'))
    await expect(page.getByTestId('step-found-by')).toHaveCount(2)
    await inRecorder(electronApp, `document.querySelector('button[title="Login"]').click()`)
    await expect(page.getByTestId('step-found-by')).toHaveCount(3)
    await expect(page.getByText('Found by role · button "Login"')).toBeVisible()

    await page.getByRole('button', { name: 'Stop & save' }).click()
    await expect(
      page.getByText('Saved to your project as Login (spec/login_spec.rb)')
    ).toBeVisible()

    // The spec is plain Selenium on the 4.0 runtime
    const spec = fs.readFileSync(path.join(projectPath, 'spec', 'login_spec.rb'), 'utf-8')
    expect(spec).toContain("require 'ruby_raider/runtime/rspec'")
    expect(spec).toContain(
      "driver.find_element(by_role('button', name: 'Login', exact: true)).click"
    )
    expect(spec).toContain("send_keys(ENV.fetch('RAIDER_SECRET_1'))")
    expect(spec).not.toContain('12341234')
    for (const old of ['eventually', 'wait.until', 'displayed?', 'WaitHelper']) {
      expect(spec).not.toContain(old)
    }

    // Run it: the first run installs the gems, then rspec drives Chrome through the runtime
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('run-phase')).toHaveText('Passed', { timeout: 10 * 60_000 })

    const runJson = JSON.parse(
      fs.readFileSync(path.join(projectPath, 'raider-results', 'run.json'), 'utf-8')
    )
    const result = runJson.results.find((r: { full_name: string }) => r.full_name === 'Login Login')
    expect(result.status).toBe('passed')
    expect(result.attachments.map((a: { name: string }) => a.name)).toContain('trace')

    // The reporter 1.0.0 results open on the Dashboard, and the trace from there
    await page.locator('button').filter({ hasText: 'Dashboard' }).click()
    await page.getByText('Login Login').click()
    await page
      .getByRole('button', { name: /^Open trace/ })
      .first()
      .click()
    const viewer = page.getByTestId('trace-viewer')
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole('option', { name: /Clicked the "Login" button/ })).toBeVisible()
    await expect(viewer.getByRole('option', { name: /Typed a secret into/ })).toBeVisible()

    // RAIDER_REAL_GEM_OUT=<dir> keeps the run's evidence: the spec, run.json and the trace
    const out = process.env.RAIDER_REAL_GEM_OUT
    if (out) {
      fs.mkdirSync(out, { recursive: true })
      fs.copyFileSync(
        path.join(projectPath, 'spec', 'login_spec.rb'),
        path.join(out, 'login_spec.rb')
      )
      fs.copyFileSync(
        path.join(projectPath, 'raider-results', 'run.json'),
        path.join(out, 'run.json')
      )
      const trace = result.attachments.find((a: { name: string }) => a.name === 'trace')
      fs.copyFileSync(
        path.join(projectPath, 'raider-results', trace.path),
        path.join(out, 'trace.zip')
      )
      fs.copyFileSync(path.join(projectPath, 'Gemfile.lock'), path.join(out, 'Gemfile.lock'))
    }
  })
})
