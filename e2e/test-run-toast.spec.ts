import { test, expect } from './electronApp'
import { goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'
import { mockRunner } from './helpers/run-mock'

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
  await setupProjectContext(page)
  await goToOverviewFiles(page)
})

test.describe('Test run toasts', () => {
  test('a run that cannot start says why', async ({ electronApp, page }) => {
    await mockRunner(electronApp, {
      events: [],
      startResult: { error: 'The project folder could not be read' }
    })
    await page.getByTitle('Run tests').click()

    await expect(page.getByText('The project folder could not be read')).toBeVisible()
    // Nothing started, so there's no run to show and Run Tests can be pressed again
    await expect(page.getByTestId('run-panel')).toHaveCount(0)
    await expect(page.getByTitle('Run tests')).toBeEnabled()
  })
})
