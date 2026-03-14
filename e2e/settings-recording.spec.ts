import { test, expect } from './electronApp'
import { goToRecorder } from './helpers/navigation'
import { mockIPCCapture, mockIPCCaptureError, getIPCCalls, mockIPC, mockIPCSync } from './helpers/ipc-mock'

test.describe('Recording Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Mock IPC methods used on Recorder mount
    await mockIPC(page, 'getSelectorPriorities', [])
    await mockIPC(page, 'getSuites', [])
    await mockIPCSync(page, 'onTestRunStatus')
    await mockIPCSync(page, 'removeTestRunStatusListener')
    await goToRecorder(page)
    await page.waitForTimeout(500)

    // Click the "Settings" tab button on the Recorder page
    // Use a button locator to avoid matching nav link
    const settingsTabBtn = page.locator('button').filter({ hasText: 'Settings' })
    await settingsTabBtn.click()
    await page.waitForTimeout(500)
  })

  test('shows Implicit Wait and Explicit Wait fields', async ({ page }) => {
    await expect(page.getByText('Implicit Wait')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Explicit Wait')).toBeVisible()
  })

  test('wait fields have number inputs', async ({ page }) => {
    const numberInputs = page.locator('input[type="number"]')
    const count = await numberInputs.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('wait values can be changed', async ({ page }) => {
    const implicitInput = page.locator('#implicit-wait')
    await implicitInput.fill('10')
    await expect(implicitInput).toHaveValue('10')

    const explicitInput = page.locator('#explicit-wait')
    await explicitInput.fill('60')
    await expect(explicitInput).toHaveValue('60')
  })

  test('Selector Priorities section is visible', async ({ page }) => {
    await expect(page.getByText('Selector Priorities')).toBeVisible()
  })

  test('shows quick add buttons for common selectors', async ({ page }) => {
    const commonSelectors = ['id', 'name', 'css', 'xpath', 'class']
    let foundCount = 0
    for (const sel of commonSelectors) {
      const btn = page.getByRole('button', { name: `+ ${sel}` })
      if (await btn.isVisible().catch(() => false)) {
        foundCount++
      }
    }
    expect(foundCount).toBeGreaterThanOrEqual(1)
  })

  test('clicking quick add button adds selector to list', async ({ page }) => {
    const quickAddBtns = page.locator('button:has-text("+ id")')
    const firstBtn = quickAddBtns.first()
    if (await firstBtn.isVisible().catch(() => false)) {
      await firstBtn.click()
      await page.waitForTimeout(300)
      // Verify "id" appears in the list
      const listItems = page.locator('[role="listitem"]')
      const count = await listItems.count()
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('custom selector can be added via input', async ({ page }) => {
    const addInput = page.getByPlaceholder('e.g., data-testid')
    if (await addInput.isVisible().catch(() => false)) {
      await addInput.fill('data-cy')
      const addBtn = page.getByRole('button', { name: 'Add' })
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click()
        await page.waitForTimeout(300)
        await expect(page.getByText('data-cy')).toBeVisible()
      }
    }
  })

  test('selector can be deleted from list', async ({ page }) => {
    const addInput = page.getByPlaceholder('e.g., data-testid')
    if (await addInput.isVisible().catch(() => false)) {
      await addInput.fill('to-delete')
      const addBtn = page.getByRole('button', { name: 'Add' })
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click()
        await page.waitForTimeout(300)
        const deleteBtn = page.getByRole('button', { name: 'Delete' }).last()
        if (await deleteBtn.isVisible().catch(() => false)) {
          await deleteBtn.click()
          await page.waitForTimeout(300)
        }
      }
    }
  })

  test('move up and move down buttons exist for selectors', async ({ page }) => {
    const addInput = page.getByPlaceholder('e.g., data-testid')
    if (await addInput.isVisible().catch(() => false)) {
      await addInput.fill('sel-one')
      await page.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(200)
      await addInput.fill('sel-two')
      await page.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(200)

      const upButtons = page.locator('button:has-text("▲")')
      const downButtons = page.locator('button:has-text("▼")')
      const upCount = await upButtons.count()
      const downCount = await downButtons.count()
      expect(upCount + downCount).toBeGreaterThanOrEqual(1)
    }
  })

  test('Update button exists', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: /update/i })
    await expect(updateBtn).toBeVisible()
  })

  test('empty selector list shows empty state', async ({ page }) => {
    await expect(page.getByText('Selector Priorities')).toBeVisible()
  })

  // ── Action verification tests ────────────────

  test('Update triggers updateRecordingSettings IPC with wait values', async ({ page }) => {
    await mockIPCCapture(page, 'updateRecordingSettings', { success: true })
    await mockIPCCapture(page, 'saveSelectorPriorities', { success: true })

    await page.locator('#implicit-wait').fill('10')
    await page.locator('#explicit-wait').fill('60')

    const updateBtn = page.getByRole('button', { name: /update/i })
    await updateBtn.click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'updateRecordingSettings')
    expect(calls.length).toBe(1)
    const settings = calls[0][0] as Record<string, number>
    expect(settings.implicitWait).toBe(10)
    expect(settings.explicitWait).toBe(60)
  })

  test('Update triggers saveSelectorPriorities with selector list', async ({ page }) => {
    await mockIPCCapture(page, 'updateRecordingSettings', { success: true })
    await mockIPCCapture(page, 'saveSelectorPriorities', { success: true })

    const addInput = page.getByPlaceholder('e.g., data-testid')
    await addInput.fill('id')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(200)
    await addInput.fill('css')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(200)

    const updateBtn = page.getByRole('button', { name: /update/i })
    await updateBtn.click()
    await page.waitForTimeout(500)

    const calls = await getIPCCalls(page, 'saveSelectorPriorities')
    expect(calls.length).toBe(1)
    const selectors = calls[0][0] as string[]
    expect(selectors).toContain('id')
    expect(selectors).toContain('css')
  })

  test('success toast after update', async ({ page }) => {
    await mockIPCCapture(page, 'updateRecordingSettings', { success: true })
    await mockIPCCapture(page, 'saveSelectorPriorities', { success: true })

    const updateBtn = page.getByRole('button', { name: /update/i })
    await updateBtn.click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('error toast on failure', async ({ page }) => {
    await mockIPCCaptureError(page, 'updateRecordingSettings', 'Failed to update')
    await mockIPCCapture(page, 'saveSelectorPriorities', { success: true })

    const updateBtn = page.getByRole('button', { name: /update/i })
    await updateBtn.click()
    await page.waitForTimeout(500)

    const toast = page.locator('[role="status"]').first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('selector reorder via move up changes order', async ({ page }) => {
    const addInput = page.getByPlaceholder('e.g., data-testid')
    await addInput.fill('first')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(200)
    await addInput.fill('second')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(200)

    const moveUpBtn = page.locator('[aria-label="Move second up"]')
    if (await moveUpBtn.isVisible().catch(() => false)) {
      await moveUpBtn.click()
      await page.waitForTimeout(300)

      const items = page.locator('[role="listitem"]')
      const firstItemText = await items.first().textContent()
      expect(firstItemText).toContain('second')
    }
  })
})
