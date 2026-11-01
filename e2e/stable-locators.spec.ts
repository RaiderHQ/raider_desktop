import { createServer, type Server } from 'http'
import { readFileSync } from 'fs'
import path from 'path'
import type { AddressInfo } from 'net'
import type { ElectronApplication } from '@playwright/test'
import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockProjectTests,
  setProjectLayout
} from './helpers/ipc-mock'

// A real recording: the recorder webview opens a local page (it only opens websites,
// so the page is served over http), its preload picks each element's locator, and
// main turns the events into steps.

const fixtureHtml = readFileSync(path.join(__dirname, 'fixtures/stable-locators.html'), 'utf-8')
let server: Server
let pageUrl: string

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fixtureHtml)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  pageUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const recordable = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

/** Waits for the recorder webview to finish loading `url`. */
async function waitForRecorderPage(electronApp: ElectronApplication, url: string): Promise<void> {
  await expect
    .poll(
      () =>
        electronApp.evaluate(({ webContents }, u) => {
          const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
          return Boolean(guest && guest.getURL() === u && !guest.isLoading())
        }, url),
      { timeout: 15000 }
    )
    .toBe(true)
}

/** Clicks the element matching `selector` in the page being recorded. */
async function clickInRecorder(electronApp: ElectronApplication, selector: string): Promise<void> {
  await electronApp.evaluate(async ({ webContents }, css) => {
    const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
    await guest!.executeJavaScript(`document.querySelector(${JSON.stringify(css)}).click()`)
  }, selector)
}

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test('a recorded page gets stable locators, and each step says how it was found', async ({
  page,
  electronApp
}) => {
  await setupProjectContext(page)
  await mockProjectTests(page, [])
  await mockIPC(page, 'getSuites', [])
  await setProjectLayout(page, recordable)
  await goToOverview(page)

  await page.getByRole('button', { name: 'New test', exact: true }).click()
  await page.getByLabel('Test name').fill('Stable locators')
  await page.getByLabel('Start URL').fill(pageUrl)
  await page.getByRole('button', { name: 'Start recording' }).click()
  await waitForRecorderPage(electronApp, pageUrl)

  const foundBy = page.getByTestId('step-found-by')
  const clicks = [
    'button',
    '#email',
    '[data-testid="promo"]',
    'section:nth-of-type(4) span',
    '.avatar',
    'li:nth-of-type(1) button',
    'li:nth-of-type(2) button'
  ]
  for (const [i, selector] of clicks.entries()) {
    await clickInRecorder(electronApp, selector)
    // One step at a time, so the steps are in click order
    await expect(foundBy).toHaveCount(i + 1)
  }

  await expect(foundBy.nth(0)).toHaveText('Found by role · button "Save"')
  await expect(foundBy.nth(1)).toHaveText('Found by label · "Email"')
  await expect(foundBy.nth(2)).toHaveText('Found by test id · promo')
  await expect(foundBy.nth(3)).toHaveText('Found by text · "Pricing"')
  // A generated id (:r1:) changes between loads, so it is never used
  await expect(foundBy.nth(4)).not.toHaveText('Found by id')
  await expect(foundBy.nth(4)).toHaveText('Found by CSS')
  // Two identical Delete buttons: neither their role nor their text tells them apart, so
  // each falls back to a position-based pick that is flagged as fragile
  for (const i of [5, 6]) {
    await expect(foundBy.nth(i)).not.toHaveText(/role|text/)
    await expect(foundBy.nth(i)).toHaveText(/^Found by (CSS|XPath)/)
    await expect(foundBy.nth(i).locator('..').getByTestId('step-weak-locator')).toBeVisible()
  }

  // The Selenium code finds Save by its role and name
  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page.getByText(/find_element\(xpath: '/).first()).toBeVisible()
  await expect(
    page.getByText(/find_element\(xpath: '\/\/button\[normalize-space\(\)="Save"/)
  ).toBeVisible()
})
