import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview } from './helpers/navigation'
import { setupProjectContext, mockIPC, mockIPCCapture, getIPCCalls } from './helpers/ipc-mock'

const projectPath = '/mock/test-project'

const fakeTrace = [
  {
    id: 'step-1',
    command: '@driver.get("https://example.com")',
    timestamp: 1_700_000_000_000,
    url: 'https://example.com',
    elementInfo: null,
    screenshotPath: null
  },
  {
    id: 'step-2',
    command: '@driver.find_element(:id, "login").click',
    timestamp: 1_700_000_001_000,
    url: 'https://example.com/login',
    elementInfo: { tagName: 'button', selector: '#login', strategy: 'id', innerText: 'Login' },
    screenshotPath: null
  }
]

/** A recorded test, and whether the recorder kept a trace for it. */
const suitesWith = (hasTrace: boolean): unknown[] => [
  {
    id: 's1',
    name: 'Smoke',
    tests: [
      {
        id: 't1',
        name: 'Search products',
        url: 'https://example.com',
        steps: [{ id: 'a', kind: 'navigate', url: 'https://example.com' }],
        ownership: 'recorded',
        file: 'spec/search_spec.rb',
        hasTrace
      }
    ]
  }
]

/** raider_reporter's run.json, with one result per test name. */
async function mockRunResults(page: Page, results: Array<{ name: string; status: string }>) {
  const runJson = JSON.stringify({
    run: { finished_at: '2026-10-28T10:00:00Z' },
    results: results.map((r) => ({ full_name: r.name, status: r.status }))
  })
  await page.evaluate(
    ([dir, data]) => {
      const api = (window as any).api
      api.readDirectory = async (path: string) =>
        path === dir ? [{ name: 'run.json', type: 'file', path: `${dir}/run.json` }] : []
      api.readFile = async (path: string) =>
        path === `${dir}/run.json` ? { success: true, data } : { success: false, error: 'missing' }
      api.reportExists = async () => false
    },
    [`${projectPath}/raider-results`, runJson]
  )
}

async function openDashboard(page: Page): Promise<void> {
  await goToOverview(page)
  // The Tests tab loads the suites the dashboard looks traces up in
  await expect(
    page.locator('li[role="button"]').filter({ hasText: 'Search products' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
}

test.describe('Dashboard trace viewer', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page, { projectPath })
    await mockIPC(page, 'listProjectTests', [
      { file: 'spec/search_spec.rb', name: 'Search products', ownership: 'recorded', testId: 't1' }
    ])
  })

  test('shows the run results', async ({ page }) => {
    await mockIPC(page, 'getSuites', suitesWith(false))
    await mockRunResults(page, [
      { name: 'Search products', status: 'passed' },
      { name: 'Checkout', status: 'failed' }
    ])
    await openDashboard(page)

    await expect(page.getByText('Overall Summary')).toBeVisible()
    await expect(page.getByText('Search products')).toBeVisible()
    await expect(page.getByText('Checkout')).toBeVisible()
  })

  test('a recorded test with a trace can be viewed step by step', async ({ page }) => {
    await mockIPC(page, 'getSuites', suitesWith(true))
    await mockIPCCapture(page, 'loadTrace', { success: true, trace: fakeTrace })
    await mockRunResults(page, [{ name: 'Search products', status: 'passed' }])
    await openDashboard(page)

    await page.getByText('Search products').click()
    await expect(page.getByText('Status:')).toBeVisible()
    await page.getByRole('button', { name: 'View Trace' }).click()

    expect(await getIPCCalls(page, 'loadTrace')).toEqual([['t1']])
    // The timeline lists each step; picking one shows what it did
    await page.getByRole('button', { name: /^2\s/ }).click()
    await expect(page.getByText('@driver.find_element(:id, "login").click')).toBeVisible()
    await expect(page.getByText('https://example.com/login')).toBeVisible()
  })

  test('a test without a trace offers none', async ({ page }) => {
    await mockIPC(page, 'getSuites', suitesWith(false))
    await mockRunResults(page, [{ name: 'Search products', status: 'passed' }])
    await openDashboard(page)

    await page.getByText('Search products').click()
    await expect(page.getByText('Status:')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View Trace' })).toHaveCount(0)
  })
})
