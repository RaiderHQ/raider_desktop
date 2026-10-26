import { test, expect } from './electronApp'
import { goToRecorder } from './helpers/navigation'
import {
  mockIPC,
  mockIPCCapture,
  mockIPCCaptureError,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

// Wait settings live inline on the Recorder page and are read from / written to the
// project's config/config.yml through the main process.
const projectSettings = {
  baseUrl: 'https://example.com',
  browser: 'chrome',
  headless: false,
  implicitWait: 4,
  explicitWait: 12,
  selectorPriority: ['id', 'css']
}

test.describe('Recording Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Must be mocked before the Recorder mounts, which loads the settings
    await mockIPC(page, 'getRecorderSettings', projectSettings)
    await goToRecorder(page)
    await page.waitForTimeout(500)
  })

  test('shows Implicit Wait and Explicit Wait fields', async ({ page }) => {
    await expect(page.getByText('Implicit Wait')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Explicit Wait')).toBeVisible()
  })

  test('wait fields are number inputs', async ({ page }) => {
    await expect(page.locator('#implicit-wait')).toHaveAttribute('type', 'number')
    await expect(page.locator('#explicit-wait')).toHaveAttribute('type', 'number')
  })

  test('wait fields show the values from the project config', async ({ page }) => {
    await expect(page.locator('#implicit-wait')).toHaveValue('4')
    await expect(page.locator('#explicit-wait')).toHaveValue('12')
  })

  test('wait values can be changed', async ({ page }) => {
    const implicitInput = page.locator('#implicit-wait')
    await implicitInput.fill('10')
    await expect(implicitInput).toHaveValue('10')

    const explicitInput = page.locator('#explicit-wait')
    await explicitInput.fill('60')
    await expect(explicitInput).toHaveValue('60')
  })

  test('leaving the implicit wait field saves it to the project config', async ({ page }) => {
    await mockIPCCapture(page, 'updateRecordingSettings', { success: true })

    await page.locator('#implicit-wait').fill('10')
    await page.locator('#implicit-wait').blur()

    await expect
      .poll(() => getIPCCalls(page, 'updateRecordingSettings'))
      .toEqual([[{ implicitWait: 10 }]])
  })

  test('leaving the explicit wait field saves it to the project config', async ({ page }) => {
    await mockIPCCapture(page, 'updateRecordingSettings', { success: true })

    await page.locator('#explicit-wait').fill('60')
    await page.locator('#explicit-wait').blur()

    await expect
      .poll(() => getIPCCalls(page, 'updateRecordingSettings'))
      .toEqual([[{ explicitWait: 60 }]])
  })

  test('error toast when saving fails', async ({ page }) => {
    await mockIPCCaptureFailure(page, 'updateRecordingSettings', 'No project open')

    await page.locator('#implicit-wait').fill('10')
    await page.locator('#implicit-wait').blur()

    await expect(page.getByText(/No project open/)).toBeVisible({ timeout: 5000 })
  })

  test('error toast when the save call throws', async ({ page }) => {
    await mockIPCCaptureError(page, 'updateRecordingSettings', 'IPC exploded')

    await page.locator('#explicit-wait').fill('60')
    await page.locator('#explicit-wait').blur()

    await expect(page.getByText(/IPC exploded/)).toBeVisible({ timeout: 5000 })
  })
})
