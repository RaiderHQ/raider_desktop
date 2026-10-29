import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setProjectPath } from './helpers/ipc-mock'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FFMPEG = '/opt/homebrew/bin/ffmpeg'
const SHOT = process.env.FAILURE_CARD_SCREENSHOT

test.describe('Failure card', () => {
  test.skip(!fs.existsSync(FFMPEG), 'ffmpeg not available to generate a fixture screenshot')

  let projectDir: string

  test.beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-card-'))
    fs.mkdirSync(path.join(projectDir, 'spec'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'spec', 'a_spec.rb'), 'it { expect(1).to eq(2) }\n')
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
    fs.writeFileSync(
      path.join(results, 'run.json'),
      JSON.stringify({
        schema_version: 1,
        client_run_id: 'e2e',
        run: {},
        results: [
          {
            identifier: 'spec/a_spec.rb:12',
            full_name: 'Card failure example',
            file_path: 'spec/a_spec.rb',
            line_number: 12,
            status: 'failed',
            duration_ms: 1234,
            failure: {
              message: 'expected: 2\n     got: 1',
              exception_class: 'RSpec::Expectations::ExpectationNotMetError',
              app_frame: 'spec/a_spec.rb:12:in `block (2 levels) in <top (required)>`',
              backtrace: [
                '/gems/rspec-support-3.13/lib/rspec/support.rb:12:in `notify_failure`',
                '/gems/rspec-expectations-3.13/lib/rspec/expectations/handler.rb:40:in `handle`',
                'spec/a_spec.rb:12:in `block (2 levels) in <top (required)>`',
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
  })

  test.afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('shows the side-by-side failure card with a foldable trace', async ({
    electronApp,
    page
  }) => {
    await mockRubyReady(electronApp, page)
    await setProjectPath(page, projectDir)
    await goToOverview(page)
    await page.locator('button').filter({ hasText: 'Dashboard' }).click()

    await page.setViewportSize({ width: 1100, height: 1000 })
    await page.getByText('Card failure example').click()
    const card = page.getByTestId('failure-details')
    await expect(card).toBeVisible()
    await expect(card.locator('img')).toBeVisible()
    await expect(page.getByTestId('failure-location')).toHaveText('spec/a_spec.rb:12')
    await expect(page.getByTestId('stack-frame-project')).toHaveCount(0)

    await page.getByTestId('stack-trace-toggle').click()
    await expect(page.getByTestId('stack-frame-project')).toHaveCount(1)
    await expect(page.getByTestId('stack-frames-folded')).toHaveCount(2)
    await page.getByTestId('stack-frames-folded').first().getByRole('button').click()
    if (SHOT) await page.screenshot({ path: SHOT })

    await page.getByTestId('failure-location').click()
    await expect(page).toHaveURL(/file-editor/)
  })
})
