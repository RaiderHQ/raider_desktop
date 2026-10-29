import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setProjectPath } from './helpers/ipc-mock'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FFMPEG = '/opt/homebrew/bin/ffmpeg'

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Failure video playback', () => {
  test.skip(!fs.existsSync(FFMPEG), 'ffmpeg not available to generate a fixture video')

  let projectDir: string

  test.beforeEach(() => {
    // Not realpathed on purpose: the file IPC guard allows os.tmpdir() as given (macOS
    // /var/... rather than /private/var/...), and raider-media follows symlinked ancestors.
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-video-'))
    const results = path.join(projectDir, 'raider-results')
    fs.mkdirSync(path.join(results, 'attachments'), { recursive: true })
    execFileSync(FFMPEG, [
      '-f', 'lavfi', '-i', 'testsrc=d=3:s=320x240',
      '-c:v', 'libvpx', '-y', path.join(results, 'attachments', '0-video.webm')
    ], { stdio: 'ignore' })
    fs.writeFileSync(
      path.join(results, 'run.json'),
      JSON.stringify({
        schema_version: 1,
        client_run_id: 'e2e',
        run: {},
        results: [
          {
            identifier: 'spec/a_spec.rb:1',
            full_name: 'Video failure example',
            file_path: 'spec/a_spec.rb',
            line_number: 1,
            status: 'failed',
            failure: { message: 'boom', backtrace: [] },
            attachments: [
              { name: 'video', content_type: 'video/webm', path: 'attachments/0-video.webm' }
            ]
          }
        ]
      })
    )
  })

  test.afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('plays and seeks a failure video served via raider-media', async ({ electronApp, page }) => {
    await mockRubyReady(electronApp, page)
    await setProjectPath(page, projectDir)
    await goToOverview(page)
    await page.locator('button').filter({ hasText: 'Dashboard' }).click()

    await page.getByText('Video failure example').click()
    await page.locator('details summary').filter({ hasText: 'Failure video' }).click()

    const video = page.getByTestId('result-video')
    await expect(video).toBeVisible()
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(1)
    const duration = await video.evaluate((v: HTMLVideoElement) => v.duration)
    expect(duration).toBeGreaterThan(2)

    const current = await video.evaluate(
      (v: HTMLVideoElement) =>
        new Promise<number>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('seeked never fired')), 10000)
          v.addEventListener(
            'seeked',
            () => {
              clearTimeout(timer)
              resolve(v.currentTime)
            },
            { once: true }
          )
          v.currentTime = 2
        })
    )
    expect(current).toBeCloseTo(2, 0)
  })
})
