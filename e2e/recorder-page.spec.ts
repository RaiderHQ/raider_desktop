import { test, expect } from './electronApp'
import { goToRecorder, createSuiteViaUI } from './helpers/navigation'

test.describe('Recorder Page', () => {
  test.beforeEach(async ({ page }) => {
    await goToRecorder(page)
  })

  test('shows Test Suites panel', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('shows Recorded Steps section', async ({ page }) => {
    await expect(page.getByText('Recorded Steps')).toBeVisible()
  })

  test('empty state shows "No Test Suites Yet" message', async ({ page }) => {
    await expect(page.getByText('No Test Suites Yet')).toBeVisible()
  })

  test('empty state shows Create Suite button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Suite' })).toBeVisible()
  })

  test('empty steps shows helper message', async ({ page }) => {
    await expect(
      page.getByText('Create a suite and add a test to start recording steps')
    ).toBeVisible()
  })

  test('output panel placeholder text exists', async ({ page }) => {
    // The output panel may be collapsed but text exists in DOM
    const outputText = page.getByText('Test output will appear here...')
    const count = await outputText.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('can create a new test suite', async ({ page }) => {
    await createSuiteViaUI(page, 'My E2E Suite')
    await expect(page.getByRole('heading', { name: 'Suite: My E2E Suite' })).toBeVisible()
  })

  test('creating multiple suites shows them all', async ({ page }) => {
    await createSuiteViaUI(page, 'Suite Alpha')
    await createSuiteViaUI(page, 'Suite Beta')

    // The active suite name is shown in the dropdown button
    await expect(page.getByRole('heading', { name: 'Suite: Suite Beta' })).toBeVisible()

    // Suite Alpha is still listed in the suite selector
    const options = page.locator('select[aria-label="Select a Suite"] option')
    await expect(options.filter({ hasText: 'Suite Alpha' })).toHaveCount(1)
  })

  test('suite creation shows "No Suite Selected" message initially', async ({ page }) => {
    await expect(page.getByText('No Suite Selected')).toBeVisible()
  })

  test('Run Output section exists in page', async ({ page }) => {
    const output = page.getByText('Run Output')
    const count = await output.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('footer version is visible on recorder page', async ({ page }) => {
    await expect(page.getByText('Ruby Raider Version')).toBeVisible()
  })
})
