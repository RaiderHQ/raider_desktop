import { test, expect } from './electronApp'
import { enterMainLayout, mockRubyReady } from './helpers/navigation'
import { getMainIPCCalls, mockMainIPCCapture } from './helpers/ipc-mock'

const PROJECT = '/mock/test-project'

test.describe('Overview settings toolbar - functional', () => {
  test.beforeEach(async ({ electronApp, page }) => {
    await mockRubyReady(electronApp, page)
    await mockMainIPCCapture(electronApp, 'get-project-config', {
      success: true,
      config: { browser: 'chrome', headless: false, timeout: 10, browserArguments: ['no-sandbox'] }
    })
    await mockMainIPCCapture(electronApp, 'read-directory', [])
    for (const channel of [
      'update-browser-url',
      'update-browser-type',
      'update-headless-mode',
      'update-timeout',
      'update-browser-options'
    ]) {
      await mockMainIPCCapture(electronApp, channel, { success: true })
    }
    await enterMainLayout(electronApp, page, PROJECT)
    // The Overview opens on the Tests tab; the settings toolbar is on Files
    await page.getByRole('button', { name: 'Files', exact: true }).click()
  })

  test('URL save triggers update-browser-url', async ({ electronApp, page }) => {
    const urlInput = page.locator('[data-testid="overview-url-input"]')
    await urlInput.fill('https://example.com')
    await urlInput.blur()
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-browser-url')).length)
      .toBeGreaterThanOrEqual(1)
    const calls = await getMainIPCCalls(electronApp, 'update-browser-url')
    expect(calls[0]).toEqual([PROJECT, 'https://example.com'])
  })

  test('browser change triggers update-browser-type', async ({ electronApp, page }) => {
    await page.locator('[data-testid="overview-browser-select"]').selectOption('firefox')
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-browser-type')).length)
      .toBe(1)
    const calls = await getMainIPCCalls(electronApp, 'update-browser-type')
    expect(calls[0]).toEqual([PROJECT, 'firefox'])
  })

  test('headless toggle triggers update-headless-mode', async ({ electronApp, page }) => {
    await page.getByTestId('overview-headless-toggle').click()
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-headless-mode')).length)
      .toBe(1)
    const calls = await getMainIPCCalls(electronApp, 'update-headless-mode')
    expect(calls[0]).toEqual([PROJECT, true])
  })

  test('timeout edit saves on blur with the new value', async ({ electronApp, page }) => {
    const input = page.locator('#timeout-input')
    await expect(input).toHaveValue('10')
    await input.fill('45')
    await input.blur()
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-timeout')).length)
      .toBe(1)
    const calls = await getMainIPCCalls(electronApp, 'update-timeout')
    expect(calls[0]).toEqual([PROJECT, 45])
  })

  test('adding a browser arg sends the full list to update-browser-options', async ({
    electronApp,
    page
  }) => {
    await expect(page.getByText('no-sandbox')).toBeVisible()
    const tagInput = page.getByPlaceholder(/^Add option/)
    await tagInput.fill('disable-gpu')
    await tagInput.press('Enter')
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-browser-options')).length)
      .toBe(1)
    const calls = await getMainIPCCalls(electronApp, 'update-browser-options')
    expect(calls[0]).toEqual([PROJECT, ['no-sandbox', 'disable-gpu']])
  })
  test('paths on the Scaffolding tab trigger update-paths on blur', async ({
    electronApp,
    page
  }) => {
    await mockMainIPCCapture(electronApp, 'update-paths', { success: true })
    await page.getByText('Scaffolding', { exact: true }).first().click()
    const pageInput = page.getByPlaceholder('e.g. pages')
    await pageInput.fill('my_pages')
    await pageInput.blur()
    await expect
      .poll(async () => (await getMainIPCCalls(electronApp, 'update-paths')).length)
      .toBeGreaterThanOrEqual(1)
    const calls = await getMainIPCCalls(electronApp, 'update-paths')
    expect(calls[0].slice(0, 2)).toEqual([PROJECT, 'my_pages'])
  })
})
