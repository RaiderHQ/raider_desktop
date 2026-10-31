import { test, expect } from './electronApp'
import { goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import type { ElectronApplication, Page } from '@playwright/test'
import { setupProjectContext } from './helpers/ipc-mock'
import {
  mockRunner,
  getStartRequests,
  started,
  phase,
  planned,
  example,
  output,
  finished
} from './helpers/run-mock'
import type { RunScope } from '../src/shared/types/runEvents'

const passing = {
  id: './spec/login_spec.rb[1:1]',
  file: 'spec/login_spec.rb',
  line: 4,
  description: 'logs in'
}
const failing = {
  id: './spec/checkout_spec.rb[1:1]',
  file: 'spec/checkout_spec.rb',
  line: 12,
  description: 'pays with a saved card'
}

/** Overview's Run Tests: the play button on the root folder of the Files tab. */
const runTests = (page: Page): Promise<void> => page.getByTitle('Run tests').click()

const startedScopes = async (app: ElectronApplication): Promise<RunScope[]> => {
  await expect.poll(() => getStartRequests(app)).toHaveLength(1)
  return (await getStartRequests(app)).map((request) => request.scope)
}

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
  await setupProjectContext(page)
  await goToOverviewFiles(page)
  // A run that starts and stays on Starting Ruby…; tests that need more script their own
  await mockRunner(electronApp, { events: [started(), phase('booting')] })
})

test.describe('Test Execution Features', () => {
  test.describe('Run Mode Select (tag-based execution)', () => {
    test('renders run mode dropdown with All, Smoke, Regression options', async ({ page }) => {
      const select = page.getByTestId('overview-run-mode-select')
      await expect(select).toBeVisible()

      const options = select.locator('option')
      await expect(options).toHaveCount(3)
      await expect(options.nth(0)).toHaveAttribute('value', 'all')
      await expect(options.nth(1)).toHaveAttribute('value', 'smoke')
      await expect(options.nth(2)).toHaveAttribute('value', 'regression')
    })

    test('runs the whole project when run mode is "all"', async ({ electronApp, page }) => {
      const select = page.getByTestId('overview-run-mode-select')
      await expect(select).toHaveValue('all')

      await runTests(page)

      expect(await startedScopes(electronApp)).toEqual([{ kind: 'all' }])
      // The app's own Ruby check may replace the mocked command, so only its shape is checked
      expect((await getStartRequests(electronApp))[0].rubyCommand).toMatch(/ruby$/)
    })

    test('runs the smoke tests when run mode is smoke', async ({ electronApp, page }) => {
      await page.getByTestId('overview-run-mode-select').selectOption('smoke')
      await runTests(page)

      expect(await startedScopes(electronApp)).toEqual([{ kind: 'tags', tags: ['smoke'] }])
    })

    test('runs the regression tests when run mode is regression', async ({ electronApp, page }) => {
      await page.getByTestId('overview-run-mode-select').selectOption('regression')
      await runTests(page)

      expect(await startedScopes(electronApp)).toEqual([{ kind: 'tags', tags: ['regression'] }])
    })

    test('a tagged run that cannot run says so and keeps the output', async ({
      electronApp,
      page
    }) => {
      await mockRunner(electronApp, {
        events: [
          started({ scope: { kind: 'tags', tags: ['smoke'] } }),
          phase('booting'),
          output("Don't know how to build task 'smoke'\n"),
          finished('errored', { total: 0 })
        ]
      })
      await page.getByTestId('overview-run-mode-select').selectOption('smoke')
      await runTests(page)

      await expect(page.getByTestId('run-phase')).toHaveText("Couldn't run")
      const details = page.getByTestId('run-tech-details')
      await details.getByText('Technical details').click()
      await expect(details).toContainText("Don't know how to build task 'smoke'")
    })
  })

  test.describe('Re-run Failed Tests', () => {
    const failedRun = (): Parameters<typeof mockRunner>[1] => ({
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

    test('renders re-run failed button', async ({ page }) => {
      const btn = page.getByTestId('overview-rerun-failed-btn')
      await expect(btn).toBeVisible()
    })

    test('is disabled while nothing has failed', async ({ page }) => {
      const btn = page.getByTestId('overview-rerun-failed-btn')
      await expect(btn).toBeDisabled()
      await expect(btn).toHaveAttribute('title', 'Nothing failed in the last run.')
    })

    test('re-runs the failed tests of the last run', async ({ electronApp, page }) => {
      await mockRunner(electronApp, failedRun())
      await runTests(page)
      await expect(page.getByTestId('run-phase')).toHaveText('Failed')

      const btn = page.getByTestId('overview-rerun-failed-btn')
      await expect(btn).toBeEnabled()
      await btn.click()

      await expect.poll(() => getStartRequests(electronApp)).toHaveLength(2)
      expect((await getStartRequests(electronApp))[1].scope).toEqual({
        kind: 'locations',
        locations: ['spec/checkout_spec.rb:12']
      })
    })

    test('re-run button is independent of run mode selection', async ({ electronApp, page }) => {
      await mockRunner(electronApp, failedRun())
      await runTests(page)
      await expect(page.getByTestId('run-phase')).toHaveText('Failed')

      // Set run mode to smoke: Re-run failed still runs the failures, not the smoke tests
      await page.getByTestId('overview-run-mode-select').selectOption('smoke')
      await page.getByTestId('overview-rerun-failed-btn').click()

      await expect.poll(() => getStartRequests(electronApp)).toHaveLength(2)
      expect((await getStartRequests(electronApp))[1].scope).toEqual({
        kind: 'locations',
        locations: ['spec/checkout_spec.rb:12']
      })
    })
  })

  test.describe('Controls visibility', () => {
    test('run mode and re-run are only visible on Files tab', async ({ page }) => {
      // Visible on Files tab
      await expect(page.getByTestId('overview-run-mode-select')).toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).toBeVisible()

      // Switch to Scaffolding tab
      await page.getByText('Scaffolding', { exact: true }).click()

      await expect(page.getByTestId('overview-run-mode-select')).not.toBeVisible()
      await expect(page.getByTestId('overview-rerun-failed-btn')).not.toBeVisible()
    })
  })
})
