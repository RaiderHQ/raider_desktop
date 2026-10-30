import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview, goToTest, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockIPCCapture,
  mockProjectTests,
  getIPCCalls,
  sendMainEvent,
  setProjectLayout
} from './helpers/ipc-mock'

const entries: Parameters<typeof mockProjectTests>[1] = [
  { file: 'spec/login_page_spec.rb', name: 'Login', ownership: 'code' },
  { file: 'spec/search_spec.rb', name: 'Search products', ownership: 'recorded', testId: 't1' },
  {
    file: 'spec/cart_spec.rb',
    name: 'Add to cart',
    ownership: 'codeOwnedWasRecorded',
    testId: 't2'
  },
  {
    file: 'spec/old_spec.rb',
    name: 'Old flow',
    ownership: 'recorded',
    testId: 't3',
    missingFile: true
  }
]

const suites = [
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
        file: 'spec/search_spec.rb'
      },
      {
        id: 't2',
        name: 'Add to cart',
        url: 'https://example.com/shop',
        steps: [{ id: 'b', kind: 'navigate', url: 'https://example.com/shop' }],
        ownership: 'codeOwnedWasRecorded',
        file: 'spec/cart_spec.rb'
      }
    ]
  }
]

const codeView = {
  file: 'spec/login_page_spec.rb',
  examples: [
    {
      name: 'logs in with right credentials',
      steps: [{ id: 'c', kind: 'navigate', url: 'https://example.com/login' }]
    },
    {
      name: 'shows an error with a wrong password',
      steps: [{ id: 'd', kind: 'custom', code: 'expect(page).to be_error' }]
    }
  ]
}

// List rows are buttons (<li role="button">), so they're found as <li>
const row = (page: Page, name: string): ReturnType<Page['locator']> =>
  page.locator('li[role="button"]').filter({ hasText: name })

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Project Tests tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await mockProjectTests(page, entries)
    await mockIPC(page, 'getSuites', suites)
  })

  test('opens on the Tests tab', async ({ page }) => {
    await goToOverview(page)
    await expect(page.getByRole('button', { name: 'Tests', exact: true })).toHaveClass(
      /border-ruby/
    )
    await expect(page.getByRole('button', { name: 'Files', exact: true })).not.toHaveClass(
      /border-ruby/
    )
  })

  test('lists every project test and marks the ones edited in code', async ({ page }) => {
    await goToOverview(page)
    await expect(row(page, 'Login')).toContainText('Edited in code')
    await expect(row(page, 'Search products')).toBeVisible()
    await expect(row(page, 'Search products')).not.toContainText('Edited in code')
    await expect(row(page, 'Add to cart')).toContainText('Edited in code')
    await expect(row(page, 'Old flow')).toContainText('File missing')
    await expect(row(page, 'Old flow').getByRole('button', { name: 'Restore' })).toBeVisible()
  })

  test('explains the Tests tab in its help', async ({ page }) => {
    await goToOverview(page)
    await page.getByRole('button', { name: 'Help information' }).click()
    await expect(page.getByRole('heading', { name: 'Tests', exact: true })).toBeVisible()
    await expect(page.getByText('help.overview', { exact: false })).toHaveCount(0)
  })

  const recordable = {
    framework: 'rspec',
    automation: 'selenium',
    specPath: 'spec',
    featurePath: 'features',
    helperPath: 'helpers',
    recordable: true
  }

  test('shows an empty state when the project has no tests', async ({ page }) => {
    await mockProjectTests(page, [])
    await setProjectLayout(page, recordable)
    await goToOverview(page)
    await expect(page.getByText('No tests yet — record one')).toBeVisible()
  })

  test('does not offer to record into a project Raider cannot record into', async ({ page }) => {
    // The mocked project folder has no Gemfile, so activation finds it can't record
    await mockProjectTests(page, [])
    await goToOverview(page)
    await expect(page.getByText('No tests found in this project yet.')).toBeVisible()
    await expect(page.getByText('No tests yet — record one')).toHaveCount(0)
  })

  test('a Cucumber project explains where its tests are', async ({ page }) => {
    await mockProjectTests(page, [])
    await setProjectLayout(page, { ...recordable, framework: 'cucumber' })
    await goToOverview(page)
    await expect(page.getByText(/tests are Cucumber features/)).toBeVisible()
    await expect(page.getByText('No tests yet — record one')).toHaveCount(0)
  })

  test('a recorded test opens on its own page', async ({ page }) => {
    await goToOverview(page)
    await row(page, 'Search products').click()
    await expect(page).toHaveURL(/#\/overview\/tests\/[A-Za-z0-9_-]+$/)
    await expect(page.getByLabel('Test name')).toHaveValue('Search products')
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit code' })).toBeVisible()
  })

  test('a test edited in code shows its tests, without fields to change', async ({ page }) => {
    await mockIPCCapture(page, 'openCodeTest', codeView)
    await goToOverview(page)
    await row(page, 'Login').click()

    await expect(page).toHaveURL(/#\/overview\/tests\/[A-Za-z0-9_-]+$/)
    // The pane mounts after the URL changes (navigations render in a transition since
    // react-router 7), so its openCodeTest call may land a moment later
    await expect
      .poll(() => getIPCCalls(page, 'openCodeTest'))
      .toEqual([['spec/login_page_spec.rb']])
    await expect(page.getByRole('button', { name: 'logs in with right credentials' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'shows an error with a wrong password' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
    await expect(page.getByLabel('Test name')).toHaveCount(0)
  })

  test('picking another test in the file shows its steps', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    await goToOverview(page)
    await row(page, 'Login').click()
    const first = page.getByRole('button', { name: 'logs in with right credentials' })
    const second = page.getByRole('button', { name: 'shows an error with a wrong password' })
    // The first test is shown until another is picked
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/example\.com\/login/)).toBeVisible()

    await second.click()
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText(/example\.com\/login/)).toHaveCount(0)
  })

  test('Run on a test edited in code runs the project file', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    await mockIPCCapture(page, 'runProjectFile', { success: true, output: '1 example, 0 failures' })
    await goToOverview(page)
    await row(page, 'Login').click()

    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect
      .poll(() => getIPCCalls(page, 'runProjectFile'))
      // The app's own Ruby check may replace the mocked command, so only its shape is checked
      .toEqual([['spec/login_page_spec.rb', expect.stringMatching(/ruby$/)]])
  })

  test('Last run shows the output of a run that stopped on a load error', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    // rspec counts 0 failures when a missing gem stops it before any example
    await mockIPC(page, 'runProjectFile', {
      success: false,
      output: '0 examples, 0 failures, 1 error occurred outside of examples'
    })
    await goToOverview(page)
    await row(page, 'Login').click()
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await page.getByRole('button', { name: 'Last run', exact: true }).click()

    await expect(page.getByTestId('last-run')).toContainText('1 error occurred outside of examples')
  })

  // A change to the open test starts the test page's 500ms autosave
  test('a change to a recorded test is autosaved', async ({ page }) => {
    await mockIPCCapture(page, 'saveRecording', { success: true })
    await goToTest(page, 'id:t1')
    await expect(page.getByLabel('Test name')).toHaveValue('Search products')
    // Opening the test may autosave it once; count only what the change adds
    await page.waitForTimeout(1000)
    const saves = async (): Promise<number> => (await getIPCCalls(page, 'saveRecording')).length
    const before = await saves()

    await page.getByLabel('Start URL').fill('https://example.com/search')
    await expect.poll(saves).toBe(before + 1)
    expect((await getIPCCalls(page, 'saveRecording')).at(-1)![1]).toMatchObject({
      id: 't1',
      url: 'https://example.com/search'
    })
  })

  test('a recorded test taken over in code is shown as code and never saved', async ({ page }) => {
    await mockIPCCapture(page, 'saveRecording', { success: false, error: 'codeOwned' })
    await mockIPCCapture(page, 'openCodeTest', {
      file: 'spec/cart_spec.rb',
      examples: [
        {
          name: 'Add to cart',
          steps: [{ id: 'b', kind: 'navigate', url: 'https://example.com/shop' }]
        }
      ]
    })
    await goToOverview(page)
    await row(page, 'Add to cart').click()

    await expect(page.getByRole('button', { name: 'Edit code' })).toBeVisible()
    expect(await getIPCCalls(page, 'openCodeTest')).toEqual([['spec/cart_spec.rb']])
    await expect(page.getByLabel('Test name')).toHaveCount(0)
    await expect(page.getByLabel('Start URL')).toHaveCount(0)
    await page.waitForTimeout(1500)
    expect(await getIPCCalls(page, 'saveRecording')).toEqual([])
  })
})

test.describe('Migration notices', () => {
  test('tells the user when recorded tests became project files', async ({ page, electronApp }) => {
    await sendMainEvent(electronApp, 'tests-migrated', { migrated: 3, postponed: false })
    await expect(
      page.getByText('Your recorded tests are now saved as project files.')
    ).toBeVisible()
  })

  test('reassures the user when the move is postponed', async ({ page, electronApp }) => {
    await sendMainEvent(electronApp, 'tests-migrated', { migrated: 0, postponed: true })
    await expect(
      page.getByText(/couldn't move your recorded tests into the project yet/)
    ).toBeVisible()
  })

  test('warns when suites were saved by a newer Raider', async ({ page, electronApp }) => {
    await sendMainEvent(electronApp, 'suites-too-new')
    await expect(page.getByText(/saved by a newer version of Raider/)).toBeVisible()
  })
})
