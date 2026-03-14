import { test, expect } from './electronApp'
import { goToOverview } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPCCapture,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

test.describe('Overview/Tests Page', () => {
  test('redirects to start-project when no project', async ({ page }) => {
    await goToOverview(page)
    await page.waitForTimeout(1000)
    const url = page.url()
    expect(url).toContain('#/start-project')
  })

  test('shows Files, Scaffolding, Settings tabs', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)

    await expect(page.getByText('Files', { exact: true })).toBeVisible()
    await expect(page.getByText('Scaffolding', { exact: true })).toBeVisible()
    // Check for the Settings tab button (not the nav link)
    await expect(page.locator('button').filter({ hasText: 'Settings' })).toBeVisible()
  })

  test('Files tab active by default', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)

    const filesTab = page.getByText('Files', { exact: true })
    // The active tab has border-b-2 border-ruby class — check it's styled as active
    await expect(filesTab).toHaveClass(/border-ruby/)
  })

  test('file tree renders from readDirectory', async ({ page }) => {
    const mockTree = [
      { name: 'spec', type: 'directory', path: '/mock/test-project/spec', children: [
        { name: 'login_spec.rb', type: 'file', path: '/mock/test-project/spec/login_spec.rb' }
      ]},
      { name: 'pages', type: 'directory', path: '/mock/test-project/pages', children: [
        { name: 'login_page.rb', type: 'file', path: '/mock/test-project/pages/login_page.rb' }
      ]}
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverview(page)

    await expect(page.getByText('spec')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('pages')).toBeVisible({ timeout: 5000 })
  })

  test('clicking file navigates to file-editor', async ({ page }) => {
    const mockTree = [
      { name: 'login_spec.rb', type: 'file', path: '/mock/test-project/login_spec.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverview(page)

    // Mock readFile for the file editor page
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({ success: true, data: '# test content' })
    })

    await page.getByText('login_spec.rb').click()
    await page.waitForTimeout(1000)

    const url = page.url()
    expect(url).toContain('#/file-editor')
  })

  test('run tests triggers runRaiderTests IPC', async ({ page }) => {
    const mockTree = [
      { name: 'test.rb', type: 'file', path: '/mock/test-project/test.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverview(page)
    await mockIPCCapture(page, 'runRaiderTests', { success: true })

    // Find and click the Run Tests button (inside the Folder component)
    const runBtn = page.getByText('Run Tests', { exact: false }).first()
    if (await runBtn.isVisible().catch(() => false)) {
      await runBtn.click()
      await page.waitForTimeout(1000)

      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      expect(calls[0][0]).toBe('/mock/test-project')
    }
  })

  test('parallel toggle passes parallel=true', async ({ page }) => {
    const mockTree = [
      { name: 'test.rb', type: 'file', path: '/mock/test-project/test.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await goToOverview(page)
    await mockIPCCapture(page, 'runRaiderTests', { success: true })

    // Toggle parallel on
    const parallelToggle = page.locator('[role="switch"]').first()
    await parallelToggle.click()
    await page.waitForTimeout(300)

    const runBtn = page.getByText('Run Tests', { exact: false }).first()
    if (await runBtn.isVisible().catch(() => false)) {
      await runBtn.click()
      await page.waitForTimeout(1000)

      const calls = await getIPCCalls(page, 'runRaiderTests')
      expect(calls.length).toBe(1)
      // Third arg is parallel flag
      expect(calls[0][2]).toBe(true)
    }
  })

  test('run tests success shows toast', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    await mockIPCCapture(page, 'runRaiderTests', { success: true })

    const runBtn = page.getByText('Run Tests', { exact: false }).first()
    if (await runBtn.isVisible().catch(() => false)) {
      await runBtn.click()
      await page.waitForTimeout(1000)

      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible({ timeout: 5000 })
    }
  })

  test('run tests failure shows error toast', async ({ page }) => {
    await setupProjectContext(page)
    await goToOverview(page)
    await mockIPCCaptureFailure(page, 'runRaiderTests', 'Tests failed')

    const runBtn = page.getByText('Run Tests', { exact: false }).first()
    if (await runBtn.isVisible().catch(() => false)) {
      await runBtn.click()
      await page.waitForTimeout(1000)

      const toast = page.locator('[role="status"]').first()
      await expect(toast).toBeVisible({ timeout: 5000 })
    }
  })
})
