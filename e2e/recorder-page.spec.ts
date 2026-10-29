import { test, expect } from './electronApp'
import { goToNewTest, goToOverview, goToTest, navigateTo, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPC,
  mockProjectTests,
  setProjectLayout
} from './helpers/ipc-mock'

// The recorder lives on the Overview's Tests tab: a list of tests, and the selected one
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

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Tests tab (recorder)', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectContext(page)
    await mockProjectTests(page, [
      { file: 'spec/search_spec.rb', name: 'Search products', ownership: 'recorded', testId: 't1' }
    ])
    await mockIPC(page, 'getSuites', suites)
  })

  test('the old recorder route opens the Tests tab', async ({ page }) => {
    await navigateTo(page, '/recorder')
    await expect(page).toHaveURL(/#\/overview\/tests$/)
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
  })

  test('asks to pick or create a test when none is selected', async ({ page }) => {
    await goToOverview(page)
    await expect(page.getByText('Select a test, or create a new one.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New test', exact: true })).toBeVisible()
  })

  test('New test asks for a name before recording can start', async ({ page }) => {
    // The mocked folder has no Gemfile, so it is given a layout Raider can record into
    await setProjectLayout(page, {
      framework: 'rspec',
      automation: 'selenium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      recordable: true
    })
    await goToNewTest(page)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
      /^Tests\s*\/\s*New test$/
    )
    const start = page.getByRole('button', { name: 'Start recording' })
    await expect(start).toBeDisabled()
    await page.getByLabel('Test name').fill('Checkout')
    await expect(start).toBeEnabled()
  })

  test('Cancel on a new test goes back to the list', async ({ page }) => {
    await goToNewTest(page)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/#\/overview\/tests$/)
    await expect(page.getByLabel('Test name')).toHaveCount(0)
  })

  test('a recorded test shows its steps and toolbar', async ({ page }) => {
    await goToTest(page, 'id:t1')
    await expect(page.getByLabel('Test name')).toHaveValue('Search products')
    await expect(page.getByLabel('Start URL')).toHaveValue('https://example.com')
    for (const name of ['Record', 'Run', 'Code', 'Last run', 'More']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
  })

  test('Last run shows and hides the run output', async ({ page }) => {
    await goToTest(page, 'id:t1')
    const lastRun = page.getByRole('button', { name: 'Last run', exact: true })
    await expect(page.getByTestId('last-run')).toHaveCount(0)
    await lastRun.click()
    await expect(page.getByTestId('last-run')).toBeVisible()
    await lastRun.click()
    await expect(page.getByTestId('last-run')).toHaveCount(0)
  })

  test('footer version is visible on the Tests tab', async ({ page }) => {
    await goToOverview(page)
    await expect(page.getByText('Ruby Raider Version')).toBeVisible()
  })
})
