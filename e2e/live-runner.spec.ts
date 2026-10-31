import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverviewFiles, mockRubyReady, navigateTo } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'
import {
  mockRunner,
  getStartRequests,
  sendRunEvent,
  started,
  phase,
  planned,
  example,
  output,
  finished,
  type ScriptedTest
} from './helpers/run-mock'

const projectPath = '/mock/test-project'

const tests: ScriptedTest[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `./spec/login_spec.rb[1:${n}]`,
  file: 'spec/login_spec.rb',
  line: n * 10,
  description: `logs in with account ${n}`
}))
const passing = tests[0]
const failing: ScriptedTest = {
  id: './spec/checkout_spec.rb[1:1]',
  file: 'spec/checkout_spec.rb',
  line: 12,
  description: 'pays with a saved card'
}

const runPhase = (page: Page) => page.getByTestId('run-phase')

/** Overview's Run Tests: the play button on the root folder of the Files tab. */
async function runTests(page: Page): Promise<void> {
  await page.getByTitle('Run tests').click()
}

test.beforeEach(async ({ electronApp, page }) => {
  // The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
  await mockRubyReady(electronApp, page)
  await setupProjectContext(page, { projectPath })
  await goToOverviewFiles(page)
})

test.describe('Live runner', () => {
  test('a passing run goes from starting to running to passed', async ({ electronApp, page }) => {
    await mockRunner(electronApp, {
      stepMs: 300,
      events: [
        started(),
        phase('booting'),
        planned(tests),
        phase('running'),
        ...tests.map((t) => example(t, 'passed')),
        finished('passed', { total: 5, passed: 5 })
      ]
    })
    await runTests(page)

    await expect(page.getByTestId('run-panel')).toBeVisible()
    await expect(runPhase(page)).toHaveText('Starting Ruby…')
    await expect(runPhase(page)).toHaveText('Running')
    await expect(runPhase(page)).toHaveText('Passed')
    await expect(page.getByTestId('run-progress')).toContainText('5 of 5')
    await expect(page.getByTestId('run-test-row')).toHaveCount(5)
    await expect(page.getByTestId('run-cancel')).toHaveCount(0)
    await expect(page.getByTestId('run-again')).toBeVisible()
  })

  test('Re-run failed runs only the tests that failed', async ({ electronApp, page }) => {
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned([passing, failing]),
        phase('running'),
        example(passing, 'passed'),
        example(failing, 'failed'),
        finished('failed', { total: 2, passed: 1, failed: 1 })
      ]
    })
    await runTests(page)
    await expect(runPhase(page)).toHaveText('Failed')

    await mockRunner(electronApp, {
      events: [started(), phase('booting'), finished('passed', { total: 1, passed: 1 })]
    })
    await page.getByTestId('run-rerun-failed').click()

    await expect.poll(async () => (await getStartRequests(electronApp)).length).toBe(2)
    const rerun = (await getStartRequests(electronApp))[1]
    expect(rerun.scope).toEqual({ kind: 'locations', locations: ['spec/checkout_spec.rb:12'] })
    // Re-runs run one at a time
    expect(rerun.workers).toBeUndefined()
  })

  test('Cancel stops the run', async ({ electronApp, page }) => {
    // No run:finished: the run only ends when it's cancelled
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned(tests),
        phase('running'),
        example(passing, 'passed')
      ]
    })
    await runTests(page)
    await expect(runPhase(page)).toHaveText('Running')

    await page.getByTestId('run-cancel').click()
    await expect(runPhase(page)).toHaveText('Cancelled')
    await expect(page.getByTestId('run-cancel')).toHaveCount(0)
    // The tests that never ran are shown as skipped
    await expect(page.getByTestId('run-test-row').filter({ hasText: 'Skipped' })).toHaveCount(4)
  })

  test('a project with an older reporter asks to update it', async ({ electronApp, page }) => {
    await mockRunner(electronApp, {
      stepMs: 200,
      events: [
        started({ liveEvents: false }),
        phase('booting'),
        finished('passed', { total: 3, passed: 3 })
      ]
    })
    await runTests(page)

    await expect(page.getByText('Update raider_reporter to see each test live.')).toBeVisible()
    await expect(runPhase(page)).toHaveText('Passed')
    // Without per-test events the final counts still give the progress
    await expect(page.getByTestId('run-progress')).toContainText('3 of 3')
  })

  test('starting while a run is in progress says so', async ({ electronApp, page }) => {
    await mockRunner(electronApp, { events: [], startResult: { error: 'busy' } })
    await runTests(page)

    await expect(page.getByText('A run is already in progress.')).toBeVisible()
    await expect(page.getByTestId('run-panel')).toHaveCount(0)
  })

  // Overview's tabs (Files included) all show the run panel, so the header's
  // indicator only appears once the app leaves Overview
  test('leaving Overview mid-run shows the run indicator, which leads back to the run', async ({
    electronApp,
    page
  }) => {
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned(tests),
        phase('running'),
        example(passing, 'passed')
      ]
    })
    await runTests(page)
    await expect(page.getByTestId('run-progress')).toContainText('1 of 5')
    await expect(page.getByTestId('run-indicator')).toHaveCount(0)

    await navigateTo(page, '/start-project')
    const indicator = page.getByTestId('run-indicator')
    await expect(indicator).toHaveText('Running · 1 of 5')

    await indicator.click()
    await expect(page).toHaveURL(/#\/overview$/)
    await expect(page.getByTestId('run-panel')).toBeVisible()
    await expect(runPhase(page)).toHaveText('Running')
    await expect(indicator).toHaveCount(0)
  })

  test('the Dashboard shows the new results once the run finishes', async ({
    electronApp,
    page
  }) => {
    // The script stops short of run:finished; the test finishes the run itself below
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned([passing, failing]),
        phase('running'),
        example(passing, 'passed'),
        example(failing, 'failed'),
        output('2 examples, 1 failure\n')
      ]
    })
    await runTests(page)
    await expect(page.getByTestId('run-progress')).toContainText('2 of 2')

    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByText('No test results yet')).toBeVisible()

    // The run writes raider_reporter's run.json
    const runJson = JSON.stringify({
      run: { finished_at: new Date().toISOString() },
      results: [
        { full_name: 'Login logs in with account 1', status: 'passed' },
        { full_name: 'Checkout pays with a saved card', status: 'failed' }
      ]
    })
    await page.evaluate(
      ([dir, data]) => {
        const api = (window as any).api
        api.readDirectory = async (path: string) =>
          path === dir ? [{ name: 'run.json', type: 'file', path: `${dir}/run.json` }] : []
        api.readFile = async (path: string) =>
          path === `${dir}/run.json`
            ? { success: true, data }
            : { success: false, error: 'missing' }
        api.reportExists = async () => false
      },
      [`${projectPath}/raider-results`, runJson]
    )
    await sendRunEvent(electronApp, finished('failed', { total: 2, passed: 1, failed: 1 }))

    await expect(runPhase(page)).toHaveText('Failed')
    await expect(page.getByText('Overall Summary')).toBeVisible()
    await expect(page.getByText('Login logs in with account 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Checkout pays with a saved card', { exact: true })).toBeVisible()
  })
})
