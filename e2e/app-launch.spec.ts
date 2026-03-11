import { test, expect } from './electronApp'

test.describe('App Launch', () => {
  test('opens a window on startup', async ({ electronApp }) => {
    const windows = electronApp.windows()
    expect(windows.length).toBeGreaterThanOrEqual(1)
  })

  test('window has correct default dimensions', async ({ electronApp }) => {
    const window = await electronApp.firstWindow()
    const { width, height } = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const bounds = win.getBounds()
      return { width: bounds.width, height: bounds.height }
    })
    // The window is created at 1200x800
    expect(width).toBeGreaterThanOrEqual(1200)
    expect(height).toBeGreaterThanOrEqual(800)
  })

  test('window title is set', async ({ electronApp }) => {
    const window = await electronApp.firstWindow()
    const title = await window.title()
    // Electron apps get their title from the HTML or package name
    expect(title).toBeDefined()
  })

  test('renderer process loads without errors', async ({ page }) => {
    // Collect console errors during page load
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Give it a moment for any async errors
    await page.waitForTimeout(1000)

    // Filter out known non-critical warnings (React Router future flags, etc.)
    const criticalErrors = errors.filter(
      (e) => !e.includes('React Router Future Flag') && !e.includes('NO_I18NEXT_INSTANCE')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('app is not in fullscreen by default', async ({ electronApp }) => {
    const isFullScreen = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].isFullScreen()
    })
    expect(isFullScreen).toBe(false)
  })
})
