import { test, expect } from './electronApp'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setProjectPath } from './helpers/ipc-mock'
import { makeZip } from '../test/helpers/makeZip'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FIXTURE_DIR = path.resolve(__dirname, '../test/fixtures/trace-v1')
const FIXTURE_ZIP = path.join(FIXTURE_DIR, 'trace.zip')
const TRACE_TYPE = 'application/vnd.raider.trace+zip'
const FAILED_NAME = 'Trace replay fails after driving the page'
const PASSED_NAME = 'Passing with traces'

const traceAttachment = (file: string, attempt: number, at = `attachments/${file}`): object => ({
  name: 'trace',
  content_type: TRACE_TYPE,
  path: at,
  attempt
})

function writeRunJson(projectDir: string, failedTracePath = 'attachments/0-trace.zip'): void {
  fs.writeFileSync(
    path.join(projectDir, 'raider-results', 'run.json'),
    JSON.stringify({
      schema_version: 1,
      client_run_id: 'e2e',
      run: {},
      results: [
        {
          identifier: 'spec/trace_replay_spec.rb[1:1]',
          full_name: FAILED_NAME,
          file_path: 'spec/trace_replay_spec.rb',
          line_number: 1,
          status: 'failed',
          failure: { message: 'boom', backtrace: [] },
          attachments: [traceAttachment('0-trace.zip', 1, failedTracePath)]
        },
        {
          identifier: 'spec/trace_replay_spec.rb[1:2]',
          full_name: PASSED_NAME,
          file_path: 'spec/trace_replay_spec.rb',
          line_number: 20,
          status: 'passed',
          attachments: [traceAttachment('1-trace.zip', 1), traceAttachment('2-trace.zip', 2)]
        }
      ]
    })
  )
}

async function openDashboard(page: Page, projectDir: string): Promise<void> {
  await setProjectPath(page, projectDir)
  await goToOverview(page)
  await page.locator('button').filter({ hasText: 'Dashboard' }).click()
}

// File → Open trace, with the native picker answered in main.
async function openFromMenu(electronApp: ElectronApplication, file: string): Promise<void> {
  await electronApp.evaluate(({ dialog, Menu }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
    Menu.getApplicationMenu()!.getMenuItemById('open-trace')!.click()
  }, file)
}

// A trace with one navigate step per snapshot, built on the fixture's index.
function syntheticTrace(snapshots: string[]): Buffer {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'unzipped', 'trace.json'), 'utf8'))
  const name = (i: number): string => `steps/${String(i + 1).padStart(4, '0')}.html`
  const steps = snapshots.map((_, i) => ({
    ...base.steps[0],
    index: i + 1,
    url: `http://127.0.0.1:1/case-${i + 1}`,
    screenshot: null,
    snapshot: name(i)
  }))
  const index = {
    ...base,
    test: { ...base.test, full_name: 'Synthetic snapshots', status: 'passed', error: null },
    steps,
    network: [],
    console: []
  }
  return makeZip([
    { name: 'trace.json', data: JSON.stringify(index), method: 8 },
    // Stored, not deflated: a big repetitive page would trip the compression-ratio guard.
    ...snapshots.map((html, i) => ({ name: name(i), data: html }))
  ])
}

// The fixture re-zipped with its index edited.
function fixtureVariant(edit: (index: { steps: Record<string, unknown>[] }) => void): Buffer {
  const dir = path.join(FIXTURE_DIR, 'unzipped')
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'trace.json'), 'utf8'))
  edit(index)
  const steps = fs.readdirSync(path.join(dir, 'steps')).map((file) => ({
    name: `steps/${file}`,
    data: fs.readFileSync(path.join(dir, 'steps', file))
  }))
  return makeZip([{ name: 'trace.json', data: JSON.stringify(index), method: 8 }, ...steps])
}

const viewer = (page: Page) => page.getByTestId('trace-viewer')
const snapshotFrame = (page: Page) => page.locator('iframe[data-testid="trace-snapshot"]')

async function frameOf(page: Page): Promise<Frame> {
  const handle = await snapshotFrame(page).elementHandle()
  const frame = await handle!.contentFrame()
  return frame!
}

// What a rendered snapshot still holds that could run, load or navigate.
function probeSnapshot(frame: Frame) {
  return frame.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'))
    const strip = (v: string): string => v.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
    const attrs = all.flatMap((el) => Array.from(el.attributes))
    const head = document.head.firstElementChild
    return {
      scripts: document.querySelectorAll('script').length,
      handlers: attrs.filter((a) => /^on/i.test(a.name)).map((a) => a.name),
      jsUrls: attrs
        .filter((a) => /^(javascript|vbscript|data:text)/.test(strip(a.value)))
        .map((a) => `${a.name}=${a.value}`),
      risky: document.querySelectorAll(
        'base, meta[http-equiv="refresh" i], iframe, frame, object, embed, link, [srcdoc], [action], [formaction], set, animate'
      ).length,
      hrefs: attrs.filter((a) => a.localName === 'href').length,
      cspFirst:
        head?.localName === 'meta' && head.getAttribute('http-equiv') === 'Content-Security-Policy',
      flag: (window as Window & { __pwned?: number }).__pwned ?? null
    }
  })
}

// Records, in main, every link handed to the system browser, every window opened
// and every frame navigation in the app window.
async function spyOnLeaks(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ app, shell, BrowserWindow }) => {
    const g = globalThis as Record<string, unknown>
    const log = { opened: [] as string[], navigations: [] as string[], created: [] as string[] }
    g.__traceLeaks = log
    shell.openExternal = (async (url: string) => {
      log.opened.push(url)
    }) as never
    app.on('web-contents-created', (_e, contents) => log.created.push(contents.getType()))
    const win = BrowserWindow.getAllWindows().find((w) =>
      /^(file|https?):/.test(w.webContents.getURL())
    )!
    win.webContents.on('will-frame-navigate', (e) => log.navigations.push(e.url))
    win.webContents.on('did-create-window', () => log.created.push('window'))
  })
}

const leaks = (electronApp: ElectronApplication) =>
  electronApp.evaluate(() => (globalThis as Record<string, unknown>).__traceLeaks as {
    opened: string[]
    navigations: string[]
    created: string[]
  })

const resetLeaks = (electronApp: ElectronApplication) =>
  electronApp.evaluate(() => {
    const log = (globalThis as Record<string, any>).__traceLeaks
    log.opened.length = 0
    log.navigations.length = 0
    log.created.length = 0
  })

const RAW_LINKS = `<html><head><title>Links</title></head><body>
  <h1>Links page</h1>
  <p><a href="https://example.com/away" target="_blank">Open in a new tab</a></p>
  <p><a href="https://example.com/self">Go here</a></p>
  <p><a href="https://example.com/top" target="_top">Take the window</a></p>
</body></html>`

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Trace viewer on the real fixture', () => {
  let projectDir: string

  test.beforeEach(() => {
    // Not realpathed on purpose, as in failure-video.spec.ts: main realpaths both sides.
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-trace-'))
    const attachments = path.join(projectDir, 'raider-results', 'attachments')
    fs.mkdirSync(attachments, { recursive: true })
    for (const file of ['0-trace.zip', '1-trace.zip', '2-trace.zip']) {
      fs.copyFileSync(FIXTURE_ZIP, path.join(attachments, file))
    }
    writeRunJson(projectDir)
  })

  test.afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('opens a trace from a failed card and shows it in plain words', async ({ page }) => {
    await openDashboard(page, projectDir)
    await page.getByText(FAILED_NAME).click()
    const open = page.getByRole('button', { name: 'Open trace', exact: true })
    await expect(open).toHaveCount(1)
    await open.click()

    const overlay = viewer(page)
    await expect(overlay).toBeVisible()
    await expect(overlay.getByRole('heading', { name: FAILED_NAME })).toBeVisible()
    const secretStep = overlay.getByRole('option', {
      name: /Typed a secret into the "Password" text box/
    })
    await expect(secretStep).toBeVisible()
    await expect(
      overlay.getByRole('option', { name: /Typed a secret into the "Confirm password" text box/ })
    ).toBeVisible()
    await expect(
      overlay.getByRole('option', { name: /Typed "plain-trace-name" into the "Name" text box/ })
    ).toBeVisible()

    // The failed eventually group is marked as failed; the passed one is not.
    const groups = overlay.getByRole('option', { name: /Waited until the check passed/ })
    await expect(groups).toHaveCount(2)
    await expect(groups.nth(0)).toHaveAttribute('data-status', 'passed')
    await expect(groups.nth(1)).toHaveAttribute('data-status', 'failed')

    // Plain words only until Technical details is opened.
    const text = await overlay.innerText()
    for (const word of ['send_keys', 'id: pw', 'RSpec::', '•']) expect(text).not.toContain(word)
    expect(text).not.toMatch(/\bpw2?\b/)

    // The navigate step has a screenshot but no rect (nothing to point at).
    await overlay.getByRole('option', { name: /^1 / }).click()
    await expect(overlay.locator('img[alt="Screenshot of step 1"]').last()).toBeVisible()
    await expect(page.getByTestId('trace-rect')).toHaveCount(0)

    // Same URL as the step before: the element's rect is drawn over the screenshot.
    await secretStep.click()
    const shot = overlay.getByRole('tabpanel').locator('img[alt="Screenshot of step 2"]')
    await expect(shot).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await expect(page.getByTestId('trace-rect')).toBeVisible()
    await expect(page.getByTestId('trace-rect')).toHaveAttribute(
      'aria-label',
      'Element before the action'
    )

    await overlay.getByRole('button', { name: 'Page HTML' }).click()
    await expect(snapshotFrame(page)).toHaveAttribute('sandbox', '')
    await expect(
      page.frameLocator('[data-testid="trace-snapshot"]').getByRole('heading', { name: 'Trace' })
    ).toBeVisible()

    await overlay.getByRole('button', { name: 'Technical details' }).click()
    await expect(overlay.getByText('send_keys')).toBeVisible()
    await expect(overlay.getByText('Hidden', { exact: true })).toBeVisible()

    await overlay.getByRole('tab', { name: 'Network' }).click()
    await overlay.getByLabel('Show all steps').check()
    const requests = overlay.getByRole('tabpanel').locator('li')
    await expect(requests).toHaveCount(3)
    await expect(requests.filter({ hasText: '/api' })).toHaveCount(1)

    await overlay.getByRole('tab', { name: 'Console' }).click()
    await overlay.getByLabel('Show all steps').check()
    await expect(overlay.getByText('trace e2e error')).toBeVisible()

    await overlay.getByRole('button', { name: 'Close trace' }).click()
    await expect(overlay).toBeHidden()
  })

  test('offers one Open trace per attempt, newest first, on a passing card', async ({ page }) => {
    await openDashboard(page, projectDir)
    await page.getByText(PASSED_NAME).click()
    const buttons = page.getByRole('button', { name: /^Open trace/ })
    await expect(buttons).toHaveText(['Open trace (attempt 2)', 'Open trace (attempt 1)'])
    await buttons.first().click()
    await expect(viewer(page)).toBeVisible()
    await expect(viewer(page).getByRole('heading', { name: FAILED_NAME })).toBeVisible()
  })

  test('opens a trace from File > Open trace', async ({ electronApp, page }) => {
    await openFromMenu(electronApp, FIXTURE_ZIP)
    await expect(viewer(page)).toBeVisible()
    await expect(viewer(page).getByRole('heading', { name: FAILED_NAME })).toBeVisible()
  })

  test('refuses a run.json trace path outside attachments', async ({ page }) => {
    writeRunJson(projectDir, '../../outside.zip')
    await openDashboard(page, projectDir)
    await page.getByText(FAILED_NAME).click()
    // The failed card has none; the passing card still has its own.
    await expect(page.getByRole('button', { name: 'Open trace', exact: true })).toHaveCount(0)
    await page.getByText(PASSED_NAME).click()
    await expect(page.getByRole('button', { name: /^Open trace/ })).toHaveCount(2)
  })
})

test.describe('Trace snapshots in the sandboxed frame', () => {
  let dir: string

  test.beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-snap-'))
  })

  test.afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function openSynthetic(
    electronApp: ElectronApplication,
    page: Page,
    snapshots: string[]
  ): Promise<void> {
    const file = path.join(dir, 'synthetic.zip')
    fs.writeFileSync(file, syntheticTrace(snapshots))
    await openFromMenu(electronApp, file)
    await expect(viewer(page)).toBeVisible()
  }

  test('a link in a snapshot opens nothing and leaves the frame in place', async ({
    electronApp,
    page
  }) => {
    await spyOnLeaks(electronApp)
    await openSynthetic(electronApp, page, [RAW_LINKS])
    await viewer(page).getByRole('button', { name: 'Page HTML' }).click()
    const frameLoc = page.frameLocator('[data-testid="trace-snapshot"]')
    await expect(frameLoc.getByRole('heading', { name: 'Links page' })).toBeVisible()
    const frame = await frameOf(page)
    await resetLeaks(electronApp)

    for (const label of ['Open in a new tab', 'Go here', 'Take the window']) {
      await frameLoc.getByText(label).click()
      await page.waitForTimeout(500)
      await expect(frameLoc.getByRole('heading', { name: 'Links page' })).toBeVisible()
    }

    const log = await leaks(electronApp)
    expect(log.opened).toEqual([])
    expect(log.navigations).toEqual([])
    expect(log.created).toEqual([])
    expect(electronApp.windows().filter((w) => /^(https?):/.test(w.url()))).toEqual([])
    expect(page.url()).toMatch(/^file:/)
    expect(await frame.evaluate(() => location.href)).toBe('about:srcdoc')

    // The sanitiser drops link targets. Unsanitised, the sandbox and the app CSP still
    // keep every link from loading anything or reaching main; a same-frame link does
    // swap the frame for Chromium's blocked-page error, which is why hrefs are dropped.
    const linksPage = await snapshotFrame(page).getAttribute('srcdoc')
    expect(linksPage).not.toContain('https://example.com/')
    for (const label of ['Open in a new tab', 'Go here', 'Take the window']) {
      await snapshotFrame(page).evaluate((el, html) => el.setAttribute('srcdoc', html), RAW_LINKS)
      await expect(frameLoc.getByRole('link', { name: label })).toBeVisible()
      await frameLoc.getByRole('link', { name: label }).click()
      await page.waitForTimeout(500)
      const href = await (await frameOf(page)).evaluate(() => location.href)
      expect(href, label).toMatch(/^(about:srcdoc|chrome-error:\/\/chromewebdata\/)$/)
      // Reset, so the next srcdoc is a change.
      await snapshotFrame(page).evaluate((el) => el.setAttribute('srcdoc', ''))
    }
    expect(await leaks(electronApp)).toEqual({ opened: [], navigations: [], created: [] })
    expect(page.url()).toMatch(/^file:/)

    // Control: the spies are live. A frame of the app page navigating to a file (an
    // https frame never gets this far: the app CSP stops it) and a window.open.
    await page.evaluate(async () => {
      const probe = document.createElement('iframe')
      document.body.appendChild(probe)
      await new Promise((resolve) => setTimeout(resolve, 200))
      probe.contentWindow!.location.href = 'file:///etc/hosts'
      window.open('https://example.invalid/popup')
    })
    await expect
      .poll(async () => {
        const after = await leaks(electronApp)
        return [after.navigations, after.opened]
      })
      .toEqual([['file:///etc/hosts'], ['https://example.invalid/popup']])
  })

  test('hostile snapshots render inert in real Chromium', async ({ electronApp, page }) => {
    // Any script that ever runs reports to the app window and flags its own window.
    const P = (n: number): string => `parent.postMessage('pwned-${n}','*');window.__pwned=${n}`
    const cases: string[] = [
      `<script>${P(1)}</script>`,
      `<svg><script>${P(2)}</script><script href="data:text/javascript,${P(2)}"></script></svg>`,
      `<img src="x" onerror="${P(3)}"><body onload="${P(3)}"><div onmouseover="${P(3)}">hover</div>`,
      `<a href="jav&#x09;ascript:${P(4)}">a</a><a href=" &#106;avascript:${P(4)}">b</a>` +
        `<a href="java&NewLine;script:${P(4)}">c</a><a href="JaVaScRiPt&colon;${P(4)}">d</a>` +
        `<iframe src="javascript:${P(4)}"></iframe>`,
      `<meta http-equiv="refresh" content="0;url=https://example.invalid/refresh">` +
        `<meta http-equiv="refresh" content="0;url=about:blank">`,
      `<base href="https://example.invalid/"><a href="rel">relative</a><img src="y.png">`,
      `<iframe srcdoc="<script>${P(7)}</script>"></iframe>`,
      `<form action="https://example.invalid/post" method="post"><input name="q">` +
        `<button formaction="javascript:${P(8)}">go</button></form>`,
      `<style>p { color: red }</style><style>a{}</style><img src=x onerror="${P(9)}"></style>` +
        `<svg><style>&lt;/style&gt;&lt;img src=x onerror="${P(9)}"&gt;</style></svg>`,
      `<svg></p><style><a id="</style><img src=1 onerror=${P(10)}>">`,
      `<math><mtext><table><mglyph><style><!--</style>` +
        `<img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=${P(11)}&gt;">`,
      `<noscript><p title="</noscript><img src=x onerror=${P(12)}>"></noscript>`,
      `<svg><a xlink:href="javascript:${P(13)}"><text y="20">x</text></a>` +
        `<animate attributeName="href" to="javascript:${P(13)}"/>` +
        `<set attributeName="onmouseover" to="${P(13)}"/></svg>`,
      `<object data="javascript:${P(14)}"></object><embed src="javascript:${P(14)}">`,
      `<div style="background:url(javascript:${P(15)})">css</div>` +
        `<link rel="stylesheet" href="https://example.invalid/x.css">`,
      `<math><maction actiontype="statusline" xlink:href="javascript:${P(16)}">m</maction></math>` +
        `<svg><foreignObject><img src=x onerror="${P(16)}"></foreignObject></svg>`
    ].map((body, i) => `<html><head></head><body><h1>Case ${i + 1}</h1>${body}</body></html>`)

    await spyOnLeaks(electronApp)
    await page.evaluate(() => {
      const hits: string[] = []
      ;(window as any).__pwnedHits = hits
      window.addEventListener('message', (e) => hits.push(String(e.data)))
    })
    await openSynthetic(electronApp, page, cases)
    const overlay = viewer(page)
    await overlay.getByRole('button', { name: 'Page HTML' }).click()
    const frameLoc = page.frameLocator('[data-testid="trace-snapshot"]')

    for (let n = 1; n <= cases.length; n++) {
      await overlay.getByRole('option', { name: new RegExp(`^${n} `) }).click()
      await expect(frameLoc.getByRole('heading', { name: `Case ${n}` })).toBeVisible()
      // Long enough for a meta refresh or an image error to have fired.
      await page.waitForTimeout(400)
      const frame = await frameOf(page)
      const found = await probeSnapshot(frame)
      expect.soft(found, `case ${n}`).toEqual({
        scripts: 0,
        handlers: [],
        jsUrls: [],
        risky: 0,
        hrefs: 0,
        cspFirst: true,
        flag: null
      })
      expect(await frame.evaluate(() => location.href), `case ${n}`).toBe('about:srcdoc')
    }

    // Control: the same probe on an unsanitised page does see the payloads.
    await snapshotFrame(page).evaluate((el, html) => el.setAttribute('srcdoc', html), cases[2])
    await expect(frameLoc.getByRole('heading', { name: 'Case 3' })).toBeVisible()
    const raw = await probeSnapshot(await frameOf(page))
    expect(raw.handlers.length).toBeGreaterThan(0)
    expect(raw.cspFirst).toBe(false)

    expect(await page.evaluate(() => (window as any).__pwnedHits)).toEqual([])
    const log = await leaks(electronApp)
    expect(log.opened).toEqual([])
    expect(log.navigations).toEqual([])
    expect(log.created).toEqual([])
  })

  test('Escape closes the viewer after a click in the snapshot, which still scrolls', async ({
    electronApp,
    page
  }) => {
    const rows = Array.from({ length: 400 }, (_, i) => `<p>Row ${i + 1}</p>`).join('')
    await openSynthetic(electronApp, page, [
      `<html><head></head><body><h1>Tall page</h1>${rows}</body></html>`
    ])
    const overlay = viewer(page)
    await overlay.getByRole('button', { name: 'Page HTML' }).click()
    const frameLoc = page.frameLocator('[data-testid="trace-snapshot"]')
    await expect(frameLoc.getByRole('heading', { name: 'Tall page' })).toBeVisible()
    const frame = await frameOf(page)

    // Mouse wheel over the frame scrolls the page inside it.
    const box = (await snapshotFrame(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 800)
    await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    // A click puts focus in the frame; Escape still closes the viewer.
    await frameLoc.getByText('Row 3', { exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()
  })

  test('sanitising the largest fixture snapshot and a 5 MB page stays well under 5 s', async ({
    electronApp,
    page
  }) => {
    const stepsDir = path.join(FIXTURE_DIR, 'unzipped', 'steps')
    const largest = fs
      .readdirSync(stepsDir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => fs.readFileSync(path.join(stepsDir, f), 'utf8'))
      .sort((a, b) => b.length - a.length)[0]

    const row = (i: number): string =>
      `<div class="row r${i % 7}" data-i="${i}"><span title="Row ${i}">Row ${i}</span> ` +
      `<a href="https://example.com/${i}" target="_blank">link</a> ` +
      `<input type="text" value="v${i}"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>\n`
    let body = ''
    for (let i = 0; body.length < 5 * 1024 * 1024; i++) body += row(i)
    const big =
      `<html><head><style>${'.row{margin:0;padding:1px}.r1{color:red}\n'.repeat(500)}</style></head>` +
      `<body><h1>Big page</h1>${body}</body></html>`

    await openSynthetic(electronApp, page, [largest, big])
    const overlay = viewer(page)
    const times: Record<string, { srcdocMs: number; renderedMs: number; chars: number }> = {}

    for (const [n, label, heading, html] of [
      [1, 'fixture', 'Trace', largest],
      [2, '5 MB', 'Big page', big]
    ] as const) {
      // Screenshot before choosing the step, so its snapshot isn't loaded until Page HTML.
      await overlay.getByRole('button', { name: 'Screenshot', exact: true }).click()
      await expect(snapshotFrame(page)).toHaveCount(0)
      await overlay.getByRole('option', { name: new RegExp(`^${n} `) }).click()
      // Time from choosing Page HTML to the sanitised srcdoc being set: reading the
      // entry over IPC, sanitising and the React render, so an upper bound on sanitising.
      const srcdocMs = await page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const button = Array.from(
              document.querySelectorAll<HTMLButtonElement>('[data-testid="trace-viewer"] button')
            ).find((b) => b.textContent === 'Page HTML')!
            const timer = setTimeout(() => reject(new Error('no srcdoc after 30 s')), 30000)
            const observer = new MutationObserver(() => {
              const frame = document.querySelector('iframe[data-testid="trace-snapshot"]')
              if (!frame || !frame.getAttribute('srcdoc')) return
              clearTimeout(timer)
              observer.disconnect()
              resolve(performance.now() - started)
            })
            observer.observe(document.body, { subtree: true, childList: true, attributes: true })
            const started = performance.now()
            button.click()
          })
      )
      const started = Date.now()
      await expect(
        page.frameLocator('[data-testid="trace-snapshot"]').getByRole('heading', { name: heading })
      ).toBeVisible({ timeout: 30000 })
      times[label] = { srcdocMs, renderedMs: srcdocMs + (Date.now() - started), chars: html.length }
      expect(srcdocMs, `${label} sanitise`).toBeLessThan(5000)
    }
    console.log(`[trace-viewer timing] ${JSON.stringify(times)}`)
  })

  test('the element rect is drawn only when the page URL is unchanged', async ({
    electronApp,
    page
  }) => {
    // Steps 2 and 3 move to another page: step 2's URL differs from step 1's, step 3's matches step 2's.
    const file = path.join(dir, 'moved.zip')
    fs.writeFileSync(
      file,
      fixtureVariant((index) => {
        index.steps[1].url = 'http://127.0.0.1:55539/next'
        index.steps[2].url = 'http://127.0.0.1:55539/next'
      })
    )
    await openFromMenu(electronApp, file)
    const overlay = viewer(page)
    const panel = overlay.getByRole('tabpanel')

    await overlay.getByRole('option', { name: /^2 / }).click()
    await expect(panel.locator('img[alt="Screenshot of step 2"]')).toBeVisible()
    await expect(page.getByTestId('trace-rect')).toHaveCount(0)

    await overlay.getByRole('option', { name: /^3 / }).click()
    await expect(panel.locator('img[alt="Screenshot of step 3"]')).toBeVisible()
    await expect(page.getByTestId('trace-rect')).toBeVisible()
  })

  test('drops: renderer refusals, and the drop channel opens only allowed real files', async ({
    page
  }) => {
    const drop = (files: Array<[string, string]>) =>
      page.evaluate((list) => {
        const dt = new DataTransfer()
        for (const [name, body] of list) dt.items.add(new File([body], name))
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      }, files)

    await drop([
      ['a.zip', 'x'],
      ['b.zip', 'y']
    ])
    await expect(page.getByText('Drop one trace file at a time.')).toBeVisible()
    await drop([['notes.txt', 'x']])
    await expect(page.getByText("This file isn't a Raider trace.")).toBeVisible()
    // A File with no path on disk (as a page could make) is refused by preload.
    await drop([['made-up.zip', 'x']])
    await expect(page.getByText("Couldn't find this trace file.")).toBeVisible()
    await expect(viewer(page)).toHaveCount(0)

    // The production drop channel, called directly (the e2e build has no isolation):
    // a copy in system temp is refused after realpath, the fixture under home opens.
    const tmpCopy = path.join(dir, 'copy.zip')
    fs.copyFileSync(FIXTURE_ZIP, tmpCopy)
    const invoke = (p: string) =>
      page.evaluate(
        (file) => (window as any).electron.ipcRenderer.invoke('trace-open-drop', file),
        p
      )
    expect(await invoke(tmpCopy)).toEqual({ ok: false, error: 'notFound' })
    expect(await invoke('/etc/hosts')).toEqual({ ok: false, error: 'notFound' })
    expect(await invoke(FIXTURE_ZIP)).toMatchObject({ ok: true })
  })
})
