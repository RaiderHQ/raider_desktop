import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview, goToTest, mockRubyReady } from './helpers/navigation'
import {
  mockIPC,
  mockIPCCapture,
  mockIPCSync,
  mockProjectTests,
  getIPCCalls,
  setProjectPath,
  setProjectLayout
} from './helpers/ipc-mock'
import { mockRunner, started, phase, planned, example, finished } from './helpers/run-mock'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FFMPEG = '/opt/homebrew/bin/ffmpeg'
const SPEC = 'spec/checkout_spec.rb'
const SELECTOR = '#checkout .btn-save-9f2'
const FAILING = {
  id: `./${SPEC}[1:1]`,
  file: SPEC,
  line: 14,
  description: 'Checkout fails'
}

const element = (value: string, label: string): Record<string, string> => ({
  strategy: 'css',
  value,
  label
})

const steps = [
  { id: 's1', kind: 'navigate', url: 'https://example.com/shop' },
  { id: 's2', kind: 'type', element: element('#email', 'Email'), text: 'a@b.co' },
  { id: 's3', kind: 'click', element: element(SELECTOR, 'Save') },
  {
    id: 's4',
    kind: 'assert',
    check: 'textEquals',
    element: element('#welcome', 'Welcome message'),
    expected: 'Welcome'
  }
]

const savedTests = [
  {
    id: 't1',
    name: 'Checkout',
    url: 'https://example.com/shop',
    steps,
    ownership: 'recorded',
    file: SPEC
  }
]

const recordable = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const NOT_FOUND = {
  exceptionClass: 'Selenium::WebDriver::Error::NoSuchElementError',
  message: `no such element: Unable to locate element: {"method":"css selector","selector":"${SELECTOR}"}`
}

test.describe('Failed step', () => {
  test.skip(!fs.existsSync(FFMPEG), 'ffmpeg not available to generate a fixture screenshot')

  let projectDir: string

  /** The project's last run: one failed result of the checkout spec. */
  const writeRun = (failure: { exceptionClass: string; message: string }): void => {
    fs.writeFileSync(
      path.join(projectDir, 'raider-results', 'run.json'),
      JSON.stringify({
        schema_version: 1,
        client_run_id: 'e2e',
        // After any run this spec starts, which only counts a result finished since
        run: { finished_at: new Date(Date.now() + 3_600_000).toISOString() },
        results: [
          {
            identifier: FAILING.id,
            full_name: FAILING.description,
            file_path: `./${SPEC}`,
            line_number: FAILING.line,
            status: 'failed',
            duration_ms: 1234,
            failure: {
              message: failure.message,
              exception_class: failure.exceptionClass,
              app_frame: `./${SPEC}:14:in \`block (2 levels) in <top (required)>\``,
              backtrace: [
                `./${SPEC}:14:in \`block (2 levels) in <top (required)>\``,
                '/gems/rspec-core-3.13/lib/rspec/core/example.rb:263:in `instance_exec`'
              ]
            },
            attachments: [
              {
                name: 'screenshot',
                content_type: 'image/png',
                path: 'attachments/0-screenshot.png'
              }
            ]
          }
        ]
      })
    )
  }

  test.beforeEach(async ({ electronApp, page }) => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-failed-step-'))
    fs.mkdirSync(path.join(projectDir, 'spec'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, SPEC), 'it { expect(1).to eq(2) }\n')
    const results = path.join(projectDir, 'raider-results')
    fs.mkdirSync(path.join(results, 'attachments'), { recursive: true })
    execFileSync(
      FFMPEG,
      [
        '-f',
        'lavfi',
        '-i',
        'testsrc=d=1:s=640x480',
        '-frames:v',
        '1',
        '-y',
        path.join(results, 'attachments', '0-screenshot.png')
      ],
      { stdio: 'ignore' }
    )
    writeRun(NOT_FOUND)
    // The startup Ruby check must pass whatever gems the host has
    await mockRubyReady(electronApp, page)
  })

  test.afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  /** The project (its real results folder), its mocked tests, and where the failure maps. */
  async function setUp(page: Page, map: { stepId: string; index: number }): Promise<void> {
    await setProjectPath(page, projectDir)
    await mockProjectTests(page, [
      { file: SPEC, name: 'Checkout', ownership: 'recorded', testId: 't1' }
    ])
    await mockIPC(page, 'getTests', savedTests)
    await mockIPC(page, 'mapFailedStep', map)
    await mockIPC(page, 'loadTrace', { trace: [] })
    await mockIPC(page, 'loadUrlRequest', null)
    await mockIPC(page, 'startRecordingMain', {
      success: true,
      url: 'about:blank',
      preloadPath: '/mock/preload.js'
    })
    await mockIPCSync(page, 'stopRecordingMain')
    await mockIPCSync(page, 'setRecordingState')
  }

  /** Nothing the default views show may be a selector or a Ruby error. */
  async function expectNothingTechnical(page: Page): Promise<void> {
    await expect(page.getByText('NoSuchElementError')).not.toBeVisible()
    await expect(page.getByText('Selenium::WebDriver')).not.toBeVisible()
    await expect(page.getByText('Unable to locate')).not.toBeVisible()
    await expect(page.getByText('btn-save-9f2')).not.toBeVisible()
  }

  const failedPanel = (page: Page): ReturnType<Page['getByTestId']> =>
    page.getByTestId('failed-step-panel')

  test('the test page shows which step failed and why, in plain words', async ({ page }) => {
    await setUp(page, { stepId: 's3', index: 2 })
    await goToTest(page, 'id:t1')

    await expect(page.getByText('Failed at step 3: Click "Save"')).toBeVisible()
    const failed = page.locator('[data-testid="step-failed"]')
    await expect(failed).toHaveCount(1)
    await expect(failed).toContainText('Save')
    await expect(page.getByText('Couldn\'t find "Save".')).toBeVisible()
    await expectNothingTechnical(page)
  })

  test('Edit value saves a corrected expected value and shows Fixed', async ({ page }) => {
    writeRun({
      exceptionClass: 'RSpec::Expectations::ExpectationNotMetError',
      message: 'expected: "Welcome"\n     got: "Hello"'
    })
    await setUp(page, { stepId: 's4', index: 3 })
    await mockIPCCapture(page, 'saveRecording', {
      success: true,
      test: { id: 't1', name: 'Checkout', file: SPEC }
    })
    await goToTest(page, 'id:t1')

    await expect(page.getByText('Failed at step 4')).toBeVisible()
    await failedPanel(page).getByRole('button', { name: 'Edit value' }).click()
    await expect(page.getByText('The page showed: Hello')).toBeVisible()
    await page.getByRole('button', { name: 'Use this' }).click()
    await page.getByTestId('edit-value-form').getByRole('button', { name: 'Save' }).click()

    await expect.poll(async () => (await getIPCCalls(page, 'saveRecording')).length).toBe(1)
    const [[, saved]] = (await getIPCCalls(page, 'saveRecording')) as [
      [string, { steps: Array<{ expected?: string }> }]
    ]
    expect(saved.steps[3].expected).toBe('Hello')
    await expect(page.getByText('Fixed. Run again to check.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
  })

  test('Fix in test on the Dashboard card opens the test page at the failed step', async ({
    page
  }) => {
    await setUp(page, { stepId: 's3', index: 2 })
    await goToOverview(page)
    await page.locator('button').filter({ hasText: 'Dashboard' }).click()

    await page.getByText(FAILING.description).click()
    await expect(page.getByTestId('failed-step-line')).toContainText('Failed at step 3')
    await expect(page.getByTestId('failed-step-line')).toContainText('Couldn\'t find "Save".')
    await expectNothingTechnical(page)

    await page.getByRole('button', { name: 'Fix in test' }).click()
    await expect(page).toHaveURL(/#\/overview\/tests\//)
    await expect(failedPanel(page)).toContainText('Failed at step 3')
  })

  test('Re-record from here asks first, and Cancel leaves the steps alone', async ({ page }) => {
    await setUp(page, { stepId: 's3', index: 2 })
    await setProjectLayout(page, recordable)
    await goToTest(page, 'id:t1')

    await failedPanel(page).getByRole('button', { name: 'Re-record from here' }).click()
    await expect(page.getByText('Re-record from step 3?')).toBeVisible()
    await expect(page.getByText('Steps 3–4 will be replaced by what you record.')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Re-record from step 3?')).toHaveCount(0)
    await expect(failedPanel(page)).toContainText('Failed at step 3')
    await expect(page.locator('[data-testid="step-failed"]')).toHaveCount(1)
  })

  test('Re-pick shows the getting-there banner, and Cancel or Esc ends it', async ({ page }) => {
    await setUp(page, { stepId: 's3', index: 2 })
    // The replay up to the step never finishes by itself: only a cancel ends it
    await page.evaluate(() => {
      const api = (window as any).api
      let end: ((r: unknown) => void) | null = null
      api.replayInWebview = () => new Promise((resolve) => (end = resolve))
      api.cancelReplay = async () => end?.({ success: false, cancelled: true })
      api.setPickMode = async () => ({ success: true })
    })
    await setProjectLayout(page, recordable)
    await goToTest(page, 'id:t1')

    const banner = page.getByRole('status').filter({ hasText: 'Getting to step 3…' })
    const rePick = failedPanel(page).getByRole('button', { name: 'Re-pick element' })

    await rePick.click()
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'Cancel' }).click()
    await expect(banner).toHaveCount(0)
    await expect(failedPanel(page)).toContainText('Failed at step 3')

    // The app window's Esc cancels it too
    await rePick.click()
    await expect(banner).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(banner).toHaveCount(0)
    await expect(failedPanel(page)).toContainText('Failed at step 3')
  })

  test('the run panel says which step failed after a run, with Fix in test', async ({
    electronApp,
    page
  }) => {
    await setUp(page, { stepId: 's3', index: 2 })
    await mockIPC(page, 'prepareTestRun', { mode: 'files', file: SPEC })
    await mockRunner(electronApp, {
      events: [
        started({ scope: { kind: 'files', files: [SPEC] } }),
        phase('booting'),
        planned([FAILING]),
        phase('running'),
        example(FAILING, 'failed'),
        finished('failed', { total: 1, failed: 1 })
      ]
    })
    await goToTest(page, 'id:t1')

    await page.getByRole('button', { name: 'Run', exact: true }).click()
    const line = page.getByTestId('run-failed-step-line')
    await expect(line).toContainText('Failed at step 3: Click "Save"')
    await expect(line).toContainText('Couldn\'t find "Save".')
    await expect(
      page.getByTestId('run-panel').getByRole('link', { name: 'Fix in test' })
    ).toBeVisible()
    await expectNothingTechnical(page)
  })
})
