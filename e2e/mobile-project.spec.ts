import { test, expect } from './electronApp'
import { goToOverview, goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import {
  mockIPC,
  mockIPCMultiple,
  mockProjectTests,
  setProjectLayout,
  setupProjectContext
} from './helpers/ipc-mock'
import { mockRunner, getStartRequests } from './helpers/run-mock'

const projectPath = '/mock/mobile-project'

const androidLayout = {
  framework: 'rspec',
  automation: 'appium',
  mobilePlatform: 'android',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: false,
  unsupportedReason: 'mobile'
}

const androidSettings = {
  platform: 'android',
  android: {
    deviceName: 'Pixel 8 API 34',
    platformVersion: '14',
    app: 'app-release.apk',
    automationName: 'UiAutomator2'
  }
}

test.beforeEach(async ({ electronApp, page }) => {
  // The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
  await mockRubyReady(electronApp, page)
  await mockRunner(electronApp, { events: [] })
  await setupProjectContext(page, { projectPath })
  await mockIPCMultiple(page, {
    getDeviceSettings: androidSettings,
    checkMobileReady: { ok: true }
  })
  await goToOverviewFiles(page)
  await setProjectLayout(page, androidLayout)
})

test.describe('Mobile project', () => {
  test('shows the Device section and no web run controls', async ({ page }) => {
    await expect(page.getByTestId('device-settings')).toBeVisible()
    await expect(page.getByTestId('device-android-deviceName')).toHaveValue('Pixel 8 API 34')
    await expect(page.getByText('Base URL')).toHaveCount(0)
    await expect(page.getByText('Headless')).toHaveCount(0)
  })

  test('does not start a run when Appium is unreachable', async ({ electronApp, page }) => {
    await mockIPC(page, 'checkMobileReady', {
      ok: false,
      reason: 'appium',
      detail: '127.0.0.1:4723'
    })
    await page.getByTitle('Run tests').click()

    await expect(page.getByTestId('mobile-not-ready')).toContainText(
      "Can't reach Appium at 127.0.0.1:4723"
    )
    expect(await getStartRequests(electronApp)).toHaveLength(0)
  })

  test('Open device settings focuses the App file field', async ({ page }) => {
    await mockIPC(page, 'checkMobileReady', {
      ok: false,
      reason: 'app',
      detail: 'app-release.apk'
    })
    await page.getByTitle('Run tests').click()

    await expect(page.getByTestId('mobile-not-ready')).toContainText(
      "Can't find the app file app-release.apk"
    )
    await page.getByRole('button', { name: 'Open device settings' }).click()
    await expect(page.getByTestId('device-android-app')).toBeFocused()
  })

  test('Open device settings from the Tests tab focuses the App file field', async ({ page }) => {
    await mockProjectTests(page, [{ file: 'spec/login_spec.rb', name: 'Login', ownership: 'code' }])
    await mockIPCMultiple(page, {
      openCodeTest: {
        file: 'spec/login_spec.rb',
        examples: [{ name: 'logs in', steps: [] }]
      },
      checkMobileReady: { ok: false, reason: 'app', detail: 'app-release.apk' }
    })
    await goToOverview(page)
    await page.getByRole('button', { name: 'Tests', exact: true }).click()
    await page.locator('li[role="button"]').filter({ hasText: 'Login' }).click()
    await page.getByRole('button', { name: 'Run', exact: true }).click()

    await expect(page.getByTestId('mobile-not-ready')).toContainText(
      "Can't find the app file app-release.apk"
    )
    await page.getByRole('button', { name: 'Open device settings' }).click()
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toHaveClass(
      /border-ruby/
    )
    await expect(page.getByTestId('device-android-app')).toBeFocused()
  })
})
