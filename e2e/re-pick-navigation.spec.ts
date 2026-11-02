import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './electronApp'
import { goToTest, mockRubyReady } from './helpers/navigation'
import {
  mockIPC,
  mockIPCCapture,
  mockProjectTests,
  getIPCCalls,
  setProjectPath,
  setProjectLayout
} from './helpers/ipc-mock'

// Re-pick in the real recorder: the step before the failed one is a link that opens another
// page, so picking must wait for that page, and a page change while picking says so.

const START = `<!doctype html><title>Shop</title><a id="go" href="/next">Go to checkout</a>`
const NEXT = `<!doctype html><title>Checkout</title>
<button id="pay" style="position:fixed;left:40px;top:40px;width:200px;height:60px">Pay now</button>`

let server: Server
let base: string

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    // A slow second page: picking must not start on the first one meanwhile
    if (req.url === '/next') setTimeout(() => res.end(NEXT), 400)
    else res.end(START)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const SPEC = 'spec/checkout_spec.rb'
const element = (value: string, label: string): Record<string, string> => ({
  strategy: 'css',
  value,
  label
})

const recordable = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

let projectDir: string

test.beforeEach(async ({ electronApp, page }) => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-re-pick-'))
  fs.mkdirSync(path.join(projectDir, 'spec'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, SPEC), 'it { expect(1).to eq(2) }\n')
  fs.mkdirSync(path.join(projectDir, 'raider-results'), { recursive: true })
  fs.writeFileSync(
    path.join(projectDir, 'raider-results', 'run.json'),
    JSON.stringify({
      schema_version: 1,
      run: { finished_at: new Date(Date.now() + 3_600_000).toISOString() },
      results: [
        {
          identifier: `./${SPEC}[1:1]`,
          full_name: 'Checkout fails',
          file_path: `./${SPEC}`,
          line_number: 14,
          status: 'failed',
          failure: {
            message: 'no such element: Unable to locate element',
            exception_class: 'Selenium::WebDriver::Error::NoSuchElementError',
            backtrace: [`./${SPEC}:14:in \`block (2 levels) in <top (required)>\``]
          }
        }
      ]
    })
  )
  await mockRubyReady(electronApp, page)
})

test.afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

/** The recorded test, its failure mapped to step 3 (on the page the link opens). */
async function setUp(page: Page): Promise<void> {
  const steps = [
    { id: 's1', kind: 'navigate', url: `${base}/` },
    { id: 's2', kind: 'click', element: element('#go', 'Go to checkout') },
    { id: 's3', kind: 'click', element: element('#pay-old', 'Pay now') }
  ]
  await setProjectPath(page, projectDir)
  await mockProjectTests(page, [
    { file: SPEC, name: 'Checkout', ownership: 'recorded', testId: 't1' }
  ])
  await mockIPC(page, 'getSuites', [
    {
      id: 's1',
      name: 'Smoke',
      tests: [
        { id: 't1', name: 'Checkout', url: `${base}/`, steps, ownership: 'recorded', file: SPEC }
      ]
    }
  ])
  await mockIPC(page, 'mapFailedStep', { stepId: 's3', index: 2 })
  await mockIPC(page, 'loadTrace', { trace: [] })
  await mockIPCCapture(page, 'saveRecording', {
    success: true,
    test: { id: 't1', name: 'Checkout', file: SPEC }
  })
  await setProjectLayout(page, recordable)
  await goToTest(page, 'id:t1')
}

/** The recorder's page, once it shows `url` and has stopped loading. */
async function recorderShows(electronApp: ElectronApplication, url: string): Promise<void> {
  await expect
    .poll(
      () =>
        electronApp.evaluate(({ webContents }, u) => {
          const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
          return Boolean(guest && guest.getURL() === u && !guest.isLoading())
        }, url),
      { timeout: 20000 }
    )
    .toBe(true)
}

/** A real click (trusted, like the user's) in the middle of `selector` on the recorder's page. */
async function userClicks(electronApp: ElectronApplication, selector: string): Promise<void> {
  await electronApp.evaluate(async ({ webContents }, css) => {
    const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')!
    const box = (await guest.executeJavaScript(
      `(() => { const r = document.querySelector(${JSON.stringify(css)}).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
    )) as { x: number; y: number }
    const at = { x: Math.round(box.x), y: Math.round(box.y) }
    guest.focus()
    guest.sendInputEvent({ type: 'mouseMove', ...at })
    guest.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
    guest.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
  }, selector)
}

const pickBanner = (page: Page): ReturnType<Page['getByRole']> =>
  page.getByRole('status').filter({ hasText: 'Click the element step 3 should use' })

test('Re-pick after a step that opens another page picks on that page', async ({
  page,
  electronApp
}) => {
  await setUp(page)
  await page
    .getByTestId('failed-step-panel')
    .getByRole('button', { name: 'Re-pick element' })
    .click()

  await expect(pickBanner(page)).toBeVisible({ timeout: 20000 })
  await recorderShows(electronApp, `${base}/next`)
  await userClicks(electronApp, '#pay')

  await expect.poll(async () => (await getIPCCalls(page, 'saveRecording')).length).toBe(1)
  const [[, saved]] = (await getIPCCalls(page, 'saveRecording')) as [
    [string, { steps: Array<{ element?: { value: string; label?: string } }> }]
  ]
  expect(saved.steps[2].element?.value).not.toBe('#pay-old')
  expect(saved.steps[2].element?.label).toBe('Pay now')
  await expect(page.getByText('Fixed. Run again to check.')).toBeVisible()
})

test('a page change while picking ends it and says to try again', async ({ page, electronApp }) => {
  await setUp(page)
  await page
    .getByTestId('failed-step-panel')
    .getByRole('button', { name: 'Re-pick element' })
    .click()
  await expect(pickBanner(page)).toBeVisible({ timeout: 20000 })

  await electronApp.evaluate(async ({ webContents }, url) => {
    const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')!
    await guest.executeJavaScript(`location.href = ${JSON.stringify(url)}`)
  }, `${base}/`)

  await expect(page.getByText('The page changed while picking. Try Re-pick again.')).toBeVisible()
  await expect(pickBanner(page)).toHaveCount(0)
  await expect(page.getByTestId('failed-step-panel')).toContainText('Failed at step 3')
  expect(await getIPCCalls(page, 'saveRecording')).toHaveLength(0)
})
