import { test, expect } from './electronApp'
import { goToOverview, goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'
import {
  mockRunner,
  getStartRequests,
  started,
  phase,
  planned,
  example,
  finished
} from './helpers/run-mock'

const login = {
  id: './spec/login_spec.rb[1:1]',
  file: 'spec/login_spec.rb',
  line: 4,
  description: 'logs in'
}

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Overview/Tests Page', () => {
  test('redirects to start-project when no project', async ({ page }) => {
    await goToOverview(page)
    await page.waitForTimeout(1000)
    const url = page.url()
    expect(url).toContain('#/start-project')
  })

  test('shows Tests, Files, Scaffolding, Dashboard tabs', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)

    await expect(page.getByRole('button', { name: 'Tests', exact: true })).toBeVisible()
    await expect(page.getByText('Files', { exact: true })).toBeVisible()
    await expect(page.getByText('Scaffolding', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()
  })

  test('Tests tab active by default', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)

    // The active tab has border-b-2 border-ruby class — check it's styled as active
    await expect(page.getByRole('button', { name: 'Tests', exact: true })).toHaveClass(
      /border-ruby/
    )
    await expect(page.getByText('Files', { exact: true })).not.toHaveClass(/border-ruby/)
  })

  test('Files tab becomes active when clicked', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverviewFiles(page)

    await expect(page.getByText('Files', { exact: true })).toHaveClass(/border-ruby/)
  })

  test('file tree renders from readDirectory', async ({ page }) => {
    const mockTree = [
      {
        name: 'spec',
        type: 'directory',
        path: '/mock/test-project/spec',
        children: [
          { name: 'login_spec.rb', type: 'file', path: '/mock/test-project/spec/login_spec.rb' }
        ]
      },
      {
        name: 'pages',
        type: 'directory',
        path: '/mock/test-project/pages',
        children: [
          { name: 'login_page.rb', type: 'file', path: '/mock/test-project/pages/login_page.rb' }
        ]
      }
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverviewFiles(page)

    await expect(page.getByText('spec')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('pages')).toBeVisible({ timeout: 5000 })
  })

  test('clicking a file previews it beside the tree', async ({ page }) => {
    const mockTree = [
      { name: 'login_spec.rb', type: 'file', path: '/mock/test-project/login_spec.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverviewFiles(page)

    // Mock readFile for the file editor page
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({ success: true, data: '# test content' })
    })

    await page.getByText('login_spec.rb').click()

    // The file opens in the Files tab's preview (the tree and the preview header name it)
    await expect(page.getByText('login_spec.rb')).toHaveCount(2)
    await expect(page.getByText('Select a file to preview')).toHaveCount(0)
    expect(page.url()).toContain('#/overview')
  })

  test('Run tests runs the whole project', async ({ electronApp, page }) => {
    const mockTree = [{ name: 'test.rb', type: 'file', path: '/mock/test-project/test.rb' }]
    await setupProjectContext(page, { files: mockTree })
    await goToOverviewFiles(page)
    await mockRunner(electronApp, { events: [started(), phase('booting')] })

    await page.getByTitle('Run tests').click()

    await expect.poll(() => getStartRequests(electronApp)).toHaveLength(1)
    const [request] = await getStartRequests(electronApp)
    expect(request.scope).toEqual({ kind: 'all' })
    // The app's own Ruby check may replace the mocked command, so only its shape is checked
    expect(request.rubyCommand).toMatch(/ruby$/)
    expect(request.workers).toBeUndefined()
    await expect(page.getByTestId('run-phase')).toHaveText('Starting Ruby…')
  })

  test('the parallel toggle runs on several workers', async ({ electronApp, page }) => {
    await setupProjectContext(page)
    await goToOverviewFiles(page)
    await mockRunner(electronApp, { events: [started(), phase('booting')] })

    const toggle = page.getByTestId('overview-parallel-toggle')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await page.getByTitle('Run tests').click()

    await expect.poll(() => getStartRequests(electronApp)).toHaveLength(1)
    // The mocked runner recommends 2 workers
    expect((await getStartRequests(electronApp))[0].workers).toBe(2)
  })

  test('a passing run shows Passed', async ({ electronApp, page }) => {
    await setupProjectContext(page)
    await goToOverviewFiles(page)
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned([login]),
        phase('running'),
        example(login, 'passed'),
        finished('passed', { total: 1, passed: 1 })
      ]
    })

    await page.getByTitle('Run tests').click()

    await expect(page.getByTestId('run-phase')).toHaveText('Passed')
    await expect(page.getByTestId('run-test-row')).toContainText(['Passed'])
  })

  test('a failing run shows Failed and the test that failed', async ({ electronApp, page }) => {
    await setupProjectContext(page)
    await goToOverviewFiles(page)
    await mockRunner(electronApp, {
      events: [
        started(),
        phase('booting'),
        planned([login]),
        phase('running'),
        example(login, 'failed'),
        finished('failed', { total: 1, failed: 1 })
      ]
    })

    await page.getByTitle('Run tests').click()

    await expect(page.getByTestId('run-phase')).toHaveText('Failed')
    await expect(page.getByTestId('run-test-row')).toContainText(['Failed'])
    await expect(page.getByTestId('run-test-row')).toContainText(['logs in'])
    await expect(page.getByTestId('run-rerun-failed')).toBeVisible()
  })
})
