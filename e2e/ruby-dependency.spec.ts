import { test, expect } from './electronApp'
import { goToRecorder } from './helpers/navigation'

test.describe('Ruby Dependency Checks', () => {
  test('recorder page loads even when Ruby check is performed', async ({ page }) => {
    await goToRecorder(page)
    await page.waitForTimeout(500)

    // The recorder page should be visible regardless of Ruby state
    await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
  })

  test('Ruby install modal has expected structure when shown', async ({ page }) => {
    // This test verifies the modal structure if it appears
    await goToRecorder(page)
    await page.waitForTimeout(1000)

    // Check if ruby install modal appeared
    const modalOverlay = page.locator('.fixed.inset-0.bg-black.bg-opacity-50')
    if (await modalOverlay.isVisible().catch(() => false)) {
      // Modal is showing - verify it has expected buttons
      const closeBtn = page.getByRole('button', { name: /close/i })
      const continueBtn = page.getByRole('button', { name: /continue/i })

      const hasClose = await closeBtn.isVisible().catch(() => false)
      const hasContinue = await continueBtn.isVisible().catch(() => false)

      expect(hasClose || hasContinue).toBe(true)
    } else {
      // No modal - Ruby is installed or check was skipped
      await expect(page.getByRole('heading', { name: 'Test Suites', exact: true })).toBeVisible()
    }
  })

  test('gems install modal has Yes/No buttons when shown', async ({ page }) => {
    await goToRecorder(page)
    await page.waitForTimeout(1000)

    // Check if gems install modal appeared
    const yesBtn = page.getByRole('button', { name: /yes/i })
    const noBtn = page.getByRole('button', { name: /^no$/i })

    if (await yesBtn.isVisible().catch(() => false)) {
      await expect(noBtn).toBeVisible()
    }
  })

  test('continue button dismisses Ruby install modal if present', async ({ page }) => {
    await goToRecorder(page)
    await page.waitForTimeout(1000)

    const continueBtn = page.getByRole('button', { name: /continue/i })
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click()
      await page.waitForTimeout(500)

      // Modal should be dismissed
      const modalOverlay = page.locator('.fixed.inset-0.bg-black.bg-opacity-50')
      await expect(modalOverlay).not.toBeVisible({ timeout: 3000 })
    }
  })
})
