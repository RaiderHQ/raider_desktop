import { test, expect } from './electronApp'
import type { Page } from '@playwright/test'
import { goToOverview, goToTest, navigateTo } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockIPCCapture,
  mockIPCSync,
  mockProjectTests,
  getIPCCalls,
  sendMainEvent,
  setProjectLayout
} from './helpers/ipc-mock'

const entries: Parameters<typeof mockProjectTests>[1] = [
  { file: 'spec/login_page_spec.rb', name: 'Login', ownership: 'code' },
  { file: 'spec/search_spec.rb', name: 'Search products', ownership: 'recorded', testId: 't1' }
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

const recordable = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const clickStep = {
  id: 'step-click',
  kind: 'click',
  element: { strategy: 'id', value: 'search', label: 'Search button' }
}

const row = (page: Page, name: string): ReturnType<Page['locator']> =>
  page.locator('li[role="button"]').filter({ hasText: name })

const breadcrumb = (page: Page): ReturnType<Page['getByRole']> =>
  page.getByRole('navigation', { name: 'Breadcrumb' })

/** The project, its tests, and a recording that main pretends to start. */
async function setUp(page: Page): Promise<void> {
  await setupProjectContext(page)
  await mockProjectTests(page, entries)
  await mockIPC(page, 'getSuites', suites)
  await mockIPC(page, 'openCodeTest', codeView)
  await mockIPC(page, 'loadUrlRequest', undefined)
  // The page in the recording browser doesn't matter: main's events are sent by the test
  await mockIPC(page, 'startRecordingMain', {
    success: true,
    url: 'about:blank',
    preloadPath: '/mock/preload.js'
  })
  await mockIPCSync(page, 'stopRecordingMain')
  await mockIPCSync(page, 'setRecordingState')
}

test.describe('Test page', () => {
  test.beforeEach(async ({ page }) => {
    await setUp(page)
  })

  // The project path isn't kept across a reload, so the project is set up again:
  // what this proves is that the route alone brings the selected test back
  test('a row opens its test, and its route restores it after a reload', async ({ page }) => {
    await goToOverview(page)
    await row(page, 'Search products').click()

    await expect(breadcrumb(page)).toHaveText(/^Tests\s*\/\s*Search products$/)
    await expect(row(page, 'Search products')).toHaveAttribute('aria-current', 'true')
    const url = page.url()
    const route = url.slice(url.indexOf('#') + 1)
    expect(route).toMatch(/^\/overview\/tests\/[A-Za-z0-9_-]+$/)

    // A reload starts the window afresh: the project and its mocks are set up again,
    // and the route alone brings the same test back
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await setUp(page)
    await navigateTo(page, route)
    await expect(breadcrumb(page)).toHaveText(/^Tests\s*\/\s*Search products$/)
    await expect(row(page, 'Search products')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByLabel('Test name')).toHaveValue('Search products')
  })

  test('a new test is named, recorded, and saved when it stops', async ({ page, electronApp }) => {
    await mockIPCCapture(page, 'saveRecording', {
      success: true,
      test: { id: 'new', name: 'Checkout', file: 'spec/checkout_spec.rb' }
    })
    await setProjectLayout(page, recordable)
    await goToOverview(page)

    await page.getByRole('button', { name: 'New test', exact: true }).click()
    await page.getByLabel('Test name').fill('Checkout')
    await page.getByLabel('Start URL').fill('https://example.com/shop')
    await page.getByRole('button', { name: 'Start recording' }).click()

    // Main says the recording started: the list folds into the rail
    await sendMainEvent(electronApp, 'recording-started', 'https://example.com/shop')
    await expect(page.getByTestId('tests-rail')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New test', exact: true })).toHaveCount(0)

    await sendMainEvent(electronApp, 'new-recorded-step', clickStep)
    await expect(page.getByText('Search button').first()).toBeVisible()

    await page.getByRole('button', { name: 'Stop & save' }).click()
    await expect(
      page.getByText('Saved to your project as Checkout (spec/checkout_spec.rb)')
    ).toBeVisible()
    const saves = await getIPCCalls(page, 'saveRecording')
    expect(saves).toHaveLength(1)
    expect(saves[0][1]).toMatchObject({
      name: 'Checkout',
      url: 'https://example.com/shop',
      steps: [{ kind: 'navigate', url: 'https://example.com/shop' }, { id: 'step-click' }]
    })
    // The list is back
    await expect(page.getByTestId('tests-rail')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New test', exact: true })).toBeVisible()
  })

  test('recording over a code test warns first, and offers a new test when the file refuses', async ({
    page,
    electronApp
  }) => {
    await mockIPCCapture(page, 'recordOverExample', {
      success: false,
      error: 'notUnique',
      count: 2
    })
    await setProjectLayout(page, recordable)
    await goToOverview(page)
    await row(page, 'Login').click()
    await expect(page.getByRole('button', { name: 'logs in with right credentials' })).toBeVisible()

    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await expect(
      page.getByText('This test has code edits. Recording will replace them. Continue?')
    ).toBeVisible()
    await expect(
      page.getByText('“logs in with right credentials” in spec/login_page_spec.rb')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()

    await sendMainEvent(electronApp, 'recording-started', 'https://example.com/login')
    await sendMainEvent(electronApp, 'new-recorded-step', clickStep)
    await page.getByRole('button', { name: 'Stop & save' }).click()

    await expect.poll(() => getIPCCalls(page, 'recordOverExample')).toHaveLength(1)
    const [call] = await getIPCCalls(page, 'recordOverExample')
    expect(call.slice(0, 2)).toEqual(['spec/login_page_spec.rb', 'logs in with right credentials'])
    await expect(
      page.getByText(
        'Raider couldn\'t find exactly one test named "logs in with right credentials" in this file.'
      )
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save as a new test' })).toBeVisible()
  })

  test('the breadcrumb Tests link goes back to the list with nothing selected', async ({
    page
  }) => {
    await goToTest(page, 'id:t1')
    await expect(breadcrumb(page)).toHaveText(/Search products/)
    await expect(row(page, 'Search products')).toHaveAttribute('aria-current', 'true')

    await breadcrumb(page).getByRole('link', { name: 'Tests' }).click()
    await expect(page).toHaveURL(/#\/overview\/tests$/)
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
    await expect(page.locator('li[aria-current="true"]')).toHaveCount(0)
  })
})
