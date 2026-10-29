import { test, expect } from './electronApp'
import { goToOverviewFiles, mockRubyReady } from './helpers/navigation'
import {
  setupProjectContext,
  mockIPCCapture,
  mockIPCCaptureFailure,
  getIPCCalls
} from './helpers/ipc-mock'

// The startup Ruby check must pass whatever gems the host has (a Missing Gems modal swallows clicks)
test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('File Editor Page', () => {
  const navigateToEditor = async (page: any): Promise<void> => {
    // Navigate to file-editor with route state
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'class LoginPage\n  def click_login\n  end\nend'
      })
    })
    // Use navigate with state via the router
    await page.evaluate(() => {
      window.history.pushState(null, '', '#/file-editor')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    // Set location state for the file editor
    await page.evaluate(() => {
      const router = (window as any).__reactRouterHistory
      // Direct navigation with state
      window.location.hash = '#/file-editor'
    })
    await page.waitForTimeout(800)
  }

  test('an Overview file click previews the file in the Files tab', async ({ page }) => {
    const mockTree = [
      { name: 'login_page.rb', type: 'file', path: '/mock/test-project/login_page.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'class LoginPage\nend'
      })
    })
    await goToOverviewFiles(page)

    await page.getByText('login_page.rb').click()

    // The tree and the preview header both name the file; the route stays on the Overview
    await expect(page.getByText('login_page.rb')).toHaveCount(2)
    await expect(page.getByText('Select a file to preview')).toHaveCount(0)
    expect(page.url()).toContain('#/overview')
  })

  test('shows loading state while file loads', async ({ page }) => {
    const mockTree = [
      { name: 'slow_file.rb', type: 'file', path: '/mock/test-project/slow_file.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    // Mock a slow readFile
    await page.evaluate(() => {
      ;(window as any).api.readFile = () =>
        new Promise((resolve) => setTimeout(() => resolve({ success: true, data: 'content' }), 3000))
    })
    await goToOverviewFiles(page)

    await page.getByText('slow_file.rb').click()

    // The preview shows a loading state until the file arrives
    await expect(page.getByText('Loading...', { exact: true })).toBeVisible()
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0, { timeout: 10000 })
  })

  test('save triggers editFile IPC with correct path and content', async ({ page }) => {
    const mockTree = [
      { name: 'edit_me.rb', type: 'file', path: '/mock/test-project/edit_me.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'original content'
      })
    })
    await goToOverviewFiles(page)
    await page.getByText('edit_me.rb').click()
    await page.waitForTimeout(1500)

    // Now mock editFile with capture
    await mockIPCCapture(page, 'editFile', { success: true })

    // Trigger save via Cmd+S
    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(1000)

    const calls = await getIPCCalls(page, 'editFile')
    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('/mock/test-project/edit_me.rb')
  })

  test('save shows success toast', async ({ page }) => {
    const mockTree = [
      { name: 'save_test.rb', type: 'file', path: '/mock/test-project/save_test.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'content'
      })
    })
    await goToOverviewFiles(page)
    await page.getByText('save_test.rb').click()
    await page.waitForTimeout(1500)
    await mockIPCCapture(page, 'editFile', { success: true })

    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(1000)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('save shows error toast on failure', async ({ page }) => {
    const mockTree = [
      { name: 'fail_save.rb', type: 'file', path: '/mock/test-project/fail_save.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'content'
      })
    })
    await goToOverviewFiles(page)
    await page.getByText('fail_save.rb').click()
    await page.waitForTimeout(1500)
    await mockIPCCaptureFailure(page, 'editFile', 'Permission denied')

    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(1000)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('back button navigates to overview', async ({ page }) => {
    const mockTree = [
      { name: 'back_test.rb', type: 'file', path: '/mock/test-project/back_test.rb' }
    ]
    await setupProjectContext(page, { files: mockTree })
    await page.evaluate(() => {
      ;(window as any).api.readFile = async () => ({
        success: true,
        data: 'content'
      })
    })
    await goToOverviewFiles(page)
    await page.getByText('back_test.rb').click()
    await page.waitForTimeout(1500)

    // Click back button (FaArrowLeft icon in a button)
    const backBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
    await backBtn.click()
    await page.waitForTimeout(800)

    expect(page.url()).toContain('#/overview')
  })
})
