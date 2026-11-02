// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { showMessageBox, fromWebContents } = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  fromWebContents: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: { showMessageBox },
  BrowserWindow: { fromWebContents },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  app: { getPath: vi.fn(() => '') }
}))

import { makeBaselineConfirm } from '../../src/main/handlers/results/baselineConfirm'

const sender = {} as never
const BASELINE = 'screenshots/baselines/chrome/checkout/cart.png'

beforeEach(() => {
  showMessageBox.mockReset()
  fromWebContents.mockReset()
  fromWebContents.mockReturnValue({ id: 1 })
})

describe('makeBaselineConfirm', () => {
  it('true for response 0, false for 1', async () => {
    const confirm = makeBaselineConfirm(sender)
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    expect(await confirm(BASELINE, '0-actual.png')).toBe(true)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await confirm(BASELINE, '0-actual.png')).toBe(false)
  })

  it('false without a window, and no dialog is shown', async () => {
    fromWebContents.mockReturnValue(null)
    expect(await makeBaselineConfirm(sender)(BASELINE, 'a.png')).toBe(false)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('looks the window up at call time', async () => {
    fromWebContents.mockReturnValue(null)
    const confirm = makeBaselineConfirm(sender)
    fromWebContents.mockReturnValue({ id: 2 })
    showMessageBox.mockResolvedValue({ response: 0 })
    expect(await confirm(BASELINE, 'a.png')).toBe(true)
  })

  it('uses the expected buttons and shows the file name, never an absolute path', async () => {
    showMessageBox.mockResolvedValue({ response: 1 })
    await makeBaselineConfirm(sender)(
      BASELINE,
      '/Users/me/proj/raider-results/attachments/0-actual.png'
    )
    const options = showMessageBox.mock.calls[0][1]
    expect(options.buttons).toEqual(['Accept as baseline', 'Cancel'])
    expect(options.defaultId).toBe(1)
    expect(options.cancelId).toBe(1)
    expect(options.message).toContain('"checkout/cart"')
    expect(options.detail).toContain(BASELINE)
    expect(options.detail).toContain('0-actual.png')
    expect(options.detail).not.toContain('/Users')
  })

  it('only a literal 0 response confirms', async () => {
    showMessageBox.mockResolvedValue({ response: '0' })
    expect(await makeBaselineConfirm(sender)(BASELINE, 'a.png')).toBe(false)
  })
})
