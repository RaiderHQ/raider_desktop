import { test, expect } from './electronApp'
import type { ElectronApplication, Page } from '@playwright/test'
import { goToOverview, goToRecorder } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockIPCCapture,
  mockProjectTests,
  getIPCCalls,
  sendMainEvent
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

const row = (page: Page, name: string): ReturnType<Page['getByRole']> =>
  page.getByRole('listitem').filter({ hasText: name })

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

  test('lists every project test with who owns it', async ({ page }) => {
    await goToOverview(page)
    await expect(row(page, 'Login')).toContainText('Code')
    await expect(row(page, 'Login').getByRole('button', { name: 'View' })).toBeVisible()
    await expect(row(page, 'Search products')).toContainText('Recorded')
    await expect(row(page, 'Search products').getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(row(page, 'Add to cart')).toContainText('Code-owned (was recorded)')
    await expect(row(page, 'Add to cart').getByRole('button', { name: 'View' })).toBeVisible()
    await expect(row(page, 'Old flow')).toContainText('File missing')
    await expect(row(page, 'Old flow').getByRole('button', { name: 'Restore' })).toBeVisible()
  })

  test('explains the Tests tab in its help', async ({ page }) => {
    await goToOverview(page)
    await page.getByRole('button', { name: 'Help information' }).click()
    await expect(page.getByRole('heading', { name: 'Tests', exact: true })).toBeVisible()
    await expect(page.getByText('help.overview', { exact: false })).toHaveCount(0)
  })

  test('shows an empty state when the project has no tests', async ({ page }) => {
    await mockProjectTests(page, [])
    await goToOverview(page)
    await expect(page.getByText('No tests yet — record one')).toBeVisible()
  })

  test('Edit opens a recorded test in the recorder', async ({ page }) => {
    await goToOverview(page)
    await row(page, 'Search products').getByRole('button', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/#\/recorder/)
    await expect(page.getByPlaceholder('Test Name')).toHaveValue('Search products')
    await expect(page.getByText('Edited in code by a developer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
  })

  test('View opens a hand-written test read-only', async ({ page }) => {
    await mockIPCCapture(page, 'openCodeTest', codeView)
    await goToOverview(page)
    await row(page, 'Login').getByRole('button', { name: 'View' }).click()

    await expect(page).toHaveURL(/#\/recorder/)
    expect(await getIPCCalls(page, 'openCodeTest')).toEqual([['spec/login_page_spec.rb']])
    await expect(page.getByText('Edited in code by a developer — view and run only.')).toBeVisible()
    await expect(page.getByText('logs in with right credentials')).toBeVisible()
    await expect(page.getByText('shows an error with a wrong password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toHaveCount(0)
    await expect(page.getByPlaceholder('Test Name')).toHaveCount(0)
  })

  test('Run in the read-only view runs the project file', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    await mockIPCCapture(page, 'runProjectFile', { success: true, output: '1 example, 0 failures' })
    await goToOverview(page)
    await row(page, 'Login').getByRole('button', { name: 'View' }).click()
    await expect(page).toHaveURL(/#\/recorder/)

    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect
      .poll(() => getIPCCalls(page, 'runProjectFile'))
      // The app's own Ruby check may replace the mocked command, so only its shape is checked
      .toEqual([['spec/login_page_spec.rb', expect.stringMatching(/ruby$/)]])
  })

  test('a run that stops on a load error shows Failed', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    // rspec counts 0 failures when a missing gem stops it before any example
    await mockIPC(page, 'runProjectFile', {
      success: false,
      output: '0 examples, 0 failures, 1 error occurred outside of examples'
    })
    await goToOverview(page)
    await row(page, 'Login').getByRole('button', { name: 'View' }).click()
    await page.getByRole('button', { name: 'Run', exact: true }).click()

    await expect(page.getByRole('button', { name: /Failed/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Passed/ })).toHaveCount(0)
  })

  test('Back to the recorder leaves the read-only view', async ({ page }) => {
    await mockIPC(page, 'openCodeTest', codeView)
    await goToOverview(page)
    await row(page, 'Login').getByRole('button', { name: 'View' }).click()
    await expect(page.getByText('logs in with right credentials')).toBeVisible()

    await page.getByRole('button', { name: 'Back to the recorder' }).click()
    await expect(page.getByText('Edited in code by a developer')).toHaveCount(0)
    await expect(page.getByText('logs in with right credentials')).toHaveCount(0)
  })

  // A suite update that changes the open test is what starts the recorder's 500ms autosave
  const changeOpenTest = async (
    electronApp: ElectronApplication,
    test: (typeof suites)[0]['tests'][0]
  ): Promise<void> => {
    await sendMainEvent(electronApp, 'suite-updated', [
      { ...suites[0], tests: [{ ...test, name: `${test.name} (changed)` }] }
    ])
  }

  test('a change to a recorded test is autosaved', async ({ page, electronApp }) => {
    // Control for the next test: the same change does reach saveRecording when editable
    await mockIPCCapture(page, 'saveRecording', { success: true })
    await mockIPC(page, 'getSuites', [{ ...suites[0], tests: [suites[0].tests[0]] }])
    await goToRecorder(page)
    await expect(page.getByPlaceholder('Test Name')).toHaveValue('Search products')

    await changeOpenTest(electronApp, suites[0].tests[0])
    await expect(page.getByPlaceholder('Test Name')).toHaveValue('Search products (changed)')
    await expect.poll(async () => (await getIPCCalls(page, 'saveRecording')).length).toBe(1)
  })

  test('a recorded test taken over in code is read-only and never saved', async ({
    page,
    electronApp
  }) => {
    await mockIPCCapture(page, 'saveRecording', { success: false, error: 'codeOwned' })
    await mockIPC(page, 'getSuites', [{ ...suites[0], tests: [suites[0].tests[1]] }])
    await goToRecorder(page)

    await expect(page.getByText('Edited in code by a developer — view and run only.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toHaveCount(0)

    await changeOpenTest(electronApp, suites[0].tests[1])
    // The change reached the recorder, which would autosave it 500ms later if it could
    await expect(page.getByRole('heading', { name: 'Add to cart (changed)' })).toBeVisible()
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
