import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockIPCCapture,
  mockProjectTests,
  setProjectLayout
} from './helpers/ipc-mock'

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('More menu on the Tests list', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
  })

  test('Run tagged tests needs a tag', async ({ page }) => {
    await page.getByRole('button', { name: 'More test actions' }).click()
    const item = page.getByRole('menuitem', { name: 'Run tagged tests' })
    await expect(item).toBeDisabled()
    await expect(item).toHaveAttribute('title', 'Pick a tag first')
  })

  test('has no suite controls', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Suite', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Suite actions' })).toHaveCount(0)
  })
})

// Check something…: pressing it makes the next click on the page pick an element, not a step
test.describe('Check something… while recording', () => {
  let server: Server
  let pageUrl: string

  test.beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><title>Fixture</title><h1 id="title" style="margin:40px">Welcome aboard</h1>`
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    pageUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  test('picking a heading asks main for assert mode and records no click', async ({
    page,
    electronApp
  }) => {
    await setupProjectContext(page)
    await mockProjectTests(page, [])
    await mockIPC(page, 'getTests', [])
    await mockIPCCapture(page, 'saveRecording', {
      success: true,
      test: { id: 'new', name: 'Check heading', file: 'spec/check_heading_spec.rb' }
    })
    await setProjectLayout(page, {
      framework: 'rspec',
      automation: 'selenium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      recordable: true
    })
    await goToOverview(page)
    await page.getByRole('button', { name: 'New test', exact: true }).click()
    await page.getByLabel('Test name').fill('Check heading')
    await page.getByLabel('Start URL').fill(pageUrl)
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect
      .poll(
        () =>
          electronApp.evaluate(({ webContents }, u) => {
            const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')
            return Boolean(guest && guest.getURL() === u && !guest.isLoading())
          }, pageUrl),
        { timeout: 20000 }
      )
      .toBe(true)

    // Watch the real channels without replacing them
    await electronApp.evaluate(({ ipcMain, Menu }) => {
      const g = global as any
      g.__SEEN__ = { pick: [], events: [], menus: 0 }
      // A native menu would block the app from closing: count it instead of showing it
      Menu.prototype.popup = function () {
        g.__SEEN__.menus++
      }
      ipcMain.prependListener('recorder-event', (_e, data) => g.__SEEN__.events.push(data))
      const handlers = (ipcMain as any)._invokeHandlers as Map<string, Function>
      const original = handlers.get('set-pick-mode')!
      handlers.set('set-pick-mode', (event: unknown, ...args: unknown[]) => {
        g.__SEEN__.pick.push(args)
        return original(event, ...args)
      })
    })
    const seen = (): Promise<{
      pick: unknown[][]
      menus: number
      events: Array<{ type?: string }>
    }> => electronApp.evaluate(() => (global as any).__SEEN__)

    await page.getByRole('button', { name: 'Check something…' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Click the thing you want to check' })
    ).toBeVisible({ timeout: 20000 })
    expect((await seen()).pick[0]).toEqual([true, 'assert'])

    await electronApp.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')!
      const box = (await guest.executeJavaScript(
        `(() => { const r = document.getElementById('title').getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
      )) as { x: number; y: number }
      const at = { x: Math.round(box.x), y: Math.round(box.y) }
      guest.focus()
      guest.sendInputEvent({ type: 'mouseMove', ...at })
      guest.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
      guest.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
    })

    // The pick ended (banner gone), and the click was not recorded as a step
    await expect(
      page.getByRole('status').filter({ hasText: 'Click the thing you want to check' })
    ).toHaveCount(0)
    // Picking a heading for a check opens the check menu, not a click step
    await expect.poll(async () => (await seen()).menus).toBe(1)
    expect((await seen()).events.filter((e) => e.type === 'click')).toHaveLength(0)
    await expect(page.getByTestId('step-found-by')).toHaveCount(0)
    await page.getByRole('button', { name: 'Stop & save' }).click()
    await expect(page.getByRole('button', { name: 'New test', exact: true })).toBeVisible()
  })
})
