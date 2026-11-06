import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const mainSend = vi.fn()
const guestSend = vi.fn()
type Guest = EventEmitter & {
  id: number
  send: typeof guestSend
  isDestroyed: () => boolean
  isLoading: () => boolean
}
let guest: Guest | null = null
let loading = false

vi.mock('electron', () => ({
  webContents: {
    fromId: (id: number): unknown => (id === 7 ? guest : undefined)
  }
}))

const showMenu = vi.fn()
vi.mock('../../src/main/handlers/recording/assertionContextMenu', () => ({
  showAssertionContextMenu: (...args: unknown[]): unknown => showMenu(...args)
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    pickMode: false,
    pickPurpose: 'repick',
    recorderWebContentsId: null,
    activeTraceDir: null,
    mainWindow: { webContents: { id: 1, send: (...args: unknown[]): unknown => mainSend(...args) } }
  }
}))

import {
  PICK_SETTLE_MS,
  setPickMode,
  handleSetPickMode,
  handleRecorderPicked,
  handleShowAssertionContextMenu,
  handleRecorderPickCancelled
} from '../../src/main/handlers/recording/pickMode'
import registerRecorderWebContents from '../../src/main/handlers/recording/registerRecorderWebContents'
import stopRecordingMain from '../../src/main/handlers/recording/stopRecordingMain'
import { appState } from '../../src/main/handlers/appState'

const state = appState as unknown as {
  pickMode: boolean
  pickModeEndedAt: number
  recorderWebContentsId: number | null
}
const picked = (): unknown[] => mainSend.mock.calls.filter((c) => c[0] === 'recorder-picked')

/** Turns pick mode on, past the wait for the page to settle */
async function pickOn(handle = (): Promise<{ success: boolean }> => setPickMode(true)) {
  const on = handle()
  await vi.advanceTimersByTimeAsync(PICK_SETTLE_MS)
  return on
}

describe('pick mode in main', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setPickMode(false)
    vi.clearAllMocks()
    loading = false
    guest = Object.assign(new EventEmitter(), {
      id: 7,
      send: guestSend,
      isDestroyed: () => false,
      isLoading: () => loading
    })
    state.recorderWebContentsId = 7
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns pick mode on in state and in the guest', async () => {
    expect(await pickOn()).toEqual({ success: true })
    expect(state.pickMode).toBe(true)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', true)
  })

  it('fails and stays off with no guest', async () => {
    state.recorderWebContentsId = null
    expect(await setPickMode(true)).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
  })

  it('fails and stays off when the guest is gone', async () => {
    state.recorderWebContentsId = 9
    expect(await setPickMode(true)).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
  })

  it('only lets the app window switch pick mode', async () => {
    expect(await pickOn(() => handleSetPickMode(7, true))).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
    expect(await pickOn(() => handleSetPickMode(1, true))).toEqual({ success: true })
    expect(state.pickMode).toBe(true)
    expect(await handleSetPickMode(7, false)).toEqual({ success: false })
    expect(state.pickMode).toBe(true)
  })

  it('ignores a pick from another sender', async () => {
    await pickOn()
    handleRecorderPicked(8, { strategy: 'css', selector: '#new', innerText: 'Save' })
    expect(picked()).toEqual([])
    expect(state.pickMode).toBe(true)
  })

  it('ignores a pick from the guest outside pick mode', () => {
    handleRecorderPicked(7, { strategy: 'css', selector: '#new', innerText: 'Save' })
    handleRecorderPickCancelled(7)
    expect(picked()).toEqual([])
  })

  it('sends the picked element to the app and ends pick mode', async () => {
    await pickOn()
    guestSend.mockClear()
    handleRecorderPicked(7, { strategy: 'css', selector: '#new', innerText: 'Save' })
    expect(picked()).toEqual([
      ['recorder-picked', { element: { strategy: 'css', value: '#new', label: 'Save' } }]
    ])
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
  })

  it('keeps a well-formed locator and drops hints that are not text', async () => {
    await pickOn()
    handleRecorderPicked(7, {
      strategy: 'id',
      selector: 'save',
      innerText: { toString: 'x' },
      ariaLabel: 'Save form',
      locator: { by: 'role', role: 'button', name: 'Save' }
    })
    expect(picked()).toEqual([
      [
        'recorder-picked',
        {
          element: {
            strategy: 'id',
            value: 'save',
            label: 'Save form',
            locator: { by: 'role', role: 'button', name: 'Save' }
          }
        }
      ]
    ])
  })

  it('a pick for a check pops the assertion menu with the validated fields and ends the pick as asserted', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'assert'))
    handleRecorderPicked(7, {
      strategy: 'id',
      selector: 'q',
      innerText: 'Search',
      elementValue: 'v'.repeat(600),
      inputType: 'text'.repeat(20),
      pageTitle: 'T'.repeat(400),
      pageUrl: 42
    })
    expect(showMenu).toHaveBeenCalledTimes(1)
    const [event, request] = showMenu.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(event).toBeNull()
    expect(request).toMatchObject({ selector: 'q', strategy: 'id', elementText: 'Search' })
    expect((request.elementValue as string).length).toBe(500)
    expect((request.inputType as string).length).toBe(32)
    expect((request.pageTitle as string).length).toBe(300)
    expect(request.pageUrl).toBeUndefined()
    expect(picked()).toEqual([['recorder-picked', { cancelled: true, reason: 'asserted' }]])
    expect(state.pickMode).toBe(false)
  })

  it('caps the label hints and the selector in main', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'assert'))
    handleRecorderPicked(7, {
      strategy: 'css',
      selector: '#' + 'a'.repeat(3000),
      innerText: 'i'.repeat(500),
      ariaLabel: 'l'.repeat(500),
      placeholder: 'p'.repeat(500)
    })
    const request = showMenu.mock.calls[0][1] as Record<string, string>
    expect(request.selector.length).toBe(2000)
    // The label hint stays at 200; the full text for an exact-text check goes to 2000
    expect(request.elementText.length).toBe(500)
    expect(request.labelText.length).toBe(200)
    expect(request.ariaLabel.length).toBe(200)
    expect(request.placeholder.length).toBe(200)
  })

  it('ends the pick before the menu opens, so a menu that throws leaves pick mode off', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'assert'))
    showMenu.mockImplementationOnce(() => {
      expect(state.pickMode).toBe(false)
      throw new Error('popup failed')
    })
    expect(() => handleRecorderPicked(7, { strategy: 'css', selector: '#x' })).toThrow()
    expect(state.pickMode).toBe(false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true, reason: 'asserted' }]])
  })

  it('a pick for a check keeps 300 characters of text whole, even for a region', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'assert'))
    const long = 'w'.repeat(300)
    handleRecorderPicked(7, {
      strategy: 'css',
      selector: '#region',
      innerText: '',
      elementText: long.repeat(10)
    })
    const request = showMenu.mock.calls[0][1] as Record<string, string>
    expect(request.elementText).toBe(long.repeat(7).slice(0, 2000))
    expect(request.labelText).toBe('')
  })

  it('rebuilds the locator from known keys with capped strings', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'assert'))
    handleRecorderPicked(7, {
      strategy: 'css',
      selector: '#x',
      locator: { by: 'role', role: 'button', name: 'n'.repeat(900), extra: 'x', positional: 'no' }
    })
    const request = showMenu.mock.calls[0][1] as { locator: Record<string, unknown> }
    expect(request.locator).toEqual({ by: 'role', role: 'button', name: 'n'.repeat(500) })
  })

  describe('a right-click in the recorder', () => {
    it('is ignored while picking', async () => {
      await pickOn()
      handleShowAssertionContextMenu(7, { strategy: 'css', selector: '#x' })
      expect(showMenu).not.toHaveBeenCalled()
    })

    it('ignores a sender that is not the recorder', () => {
      handleShowAssertionContextMenu(8, { strategy: 'css', selector: '#x' })
      expect(showMenu).not.toHaveBeenCalled()
    })

    it('opens the menu with fields capped like a pick', () => {
      handleShowAssertionContextMenu(7, {
        strategy: 'css',
        selector: '#x',
        elementText: 'Save',
        pageUrl: 'u'.repeat(10_000),
        elementValue: 5
      })
      const request = showMenu.mock.calls[0][1] as Record<string, unknown>
      expect(request).toMatchObject({ selector: '#x', elementText: 'Save' })
      expect((request.pageUrl as string).length).toBe(2000)
      expect(request.elementValue).toBeUndefined()
    })

    it('ignores a payload that is not an object', () => {
      handleShowAssertionContextMenu(7, 'x')
      expect(showMenu).not.toHaveBeenCalled()
    })
  })

  it('an unknown purpose is refused', async () => {
    expect(await handleSetPickMode(1, true, 'delete')).toEqual({ success: false })
    expect(await handleSetPickMode(1, true, { x: 1 })).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
  })

  it('a pick for a repick still forwards the element', async () => {
    await pickOn(() => handleSetPickMode(1, true, 'repick'))
    handleRecorderPicked(7, { strategy: 'css', selector: '#new', elementValue: 'x' })
    expect(showMenu).not.toHaveBeenCalled()
    expect(picked()).toEqual([['recorder-picked', { element: { strategy: 'css', value: '#new' } }]])
  })

  it.each([null, 'x', {}, { strategy: 'name', selector: 'q' }, { strategy: 'css', selector: '' }])(
    'ignores an unusable pick %j and keeps picking',
    async (data) => {
      await pickOn()
      handleRecorderPicked(7, data)
      expect(picked()).toEqual([])
      expect(state.pickMode).toBe(true)
    }
  )

  it('sends a cancel to the app and ends pick mode', async () => {
    await pickOn()
    handleRecorderPickCancelled(8)
    expect(picked()).toEqual([])
    handleRecorderPickCancelled(7)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
    expect(state.pickMode).toBe(false)
  })

  it('ends pick mode as a cancel that says the page changed when the guest navigates', async () => {
    await pickOn()
    guestSend.mockClear()
    guest!.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true, reason: 'navigated' }]])
  })

  describe('waits for the page to settle before picking', () => {
    const armed = (): boolean =>
      state.pickMode || guestSend.mock.calls.some((c) => c[0] === 'recorder-pick-mode' && c[1])

    it('until a page that is loading has loaded', async () => {
      loading = true
      const on = setPickMode(true)
      await vi.advanceTimersByTimeAsync(2000)
      expect(armed()).toBe(false)

      loading = false
      guest!.emit('did-stop-loading')
      await vi.advanceTimersByTimeAsync(PICK_SETTLE_MS)
      expect(await on).toEqual({ success: true })
      expect(state.pickMode).toBe(true)
      expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', true)
    })

    it('picks on the new page when the last replayed click starts a navigation', async () => {
      const on = setPickMode(true)
      // The click resolved before its navigation began
      await vi.advanceTimersByTimeAsync(PICK_SETTLE_MS / 2)
      loading = true
      guest!.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
      guest!.emit('did-start-loading')
      await vi.advanceTimersByTimeAsync(2000)
      expect(armed()).toBe(false)

      loading = false
      guest!.emit('did-stop-loading')
      await vi.advanceTimersByTimeAsync(PICK_SETTLE_MS)
      expect(await on).toEqual({ success: true })
      expect(state.pickMode).toBe(true)
      // The navigation came before picking: nothing was cancelled
      expect(picked()).toEqual([])
    })

    it('picks anyway after 10 s of a page that never finishes loading', async () => {
      loading = true
      const on = setPickMode(true)
      await vi.advanceTimersByTimeAsync(9_000)
      expect(armed()).toBe(false)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await on).toEqual({ success: true })
      expect(state.pickMode).toBe(true)
    })

    it('never picks when picking is turned off meanwhile', async () => {
      loading = true
      const on = setPickMode(true)
      setPickMode(false)
      loading = false
      guest!.emit('did-stop-loading')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await on).toEqual({ success: false })
      expect(armed()).toBe(false)
      expect(guest!.listenerCount('did-stop-loading')).toBe(0)
    })

    it('never picks when the recorder stops meanwhile', async () => {
      const on = setPickMode(true)
      stopRecordingMain()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await on).toEqual({ success: false })
      expect(armed()).toBe(false)
    })

    it('fails when another recorder took its place meanwhile', async () => {
      const on = setPickMode(true)
      state.recorderWebContentsId = 9
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await on).toEqual({ success: false })
      expect(armed()).toBe(false)
    })

    it('fails when the guest goes away meanwhile', async () => {
      loading = true
      const on = setPickMode(true)
      guest!.isDestroyed = (): boolean => true
      guest!.emit('destroyed')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await on).toEqual({ success: false })
      expect(armed()).toBe(false)
    })
  })

  it('keeps picking through same-document and subframe navigations', async () => {
    await pickOn()
    guest!.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    guest!.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(state.pickMode).toBe(true)
  })

  it('ends pick mode when the guest is destroyed', async () => {
    await pickOn()
    guest!.emit('destroyed')
    expect(state.pickMode).toBe(false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
  })

  it('stops watching the guest once pick mode ends', async () => {
    await pickOn()
    setPickMode(false)
    expect(guest!.listenerCount('did-start-navigation')).toBe(0)
    expect(guest!.listenerCount('destroyed')).toBe(0)
  })

  it('ends pick mode when recording stops, before forgetting the guest', async () => {
    await pickOn()
    guestSend.mockClear()
    stopRecordingMain()
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
    expect(state.recorderWebContentsId).toBeNull()
  })

  it('notes when pick mode ended, so main can ignore the rest of a double-click', async () => {
    await pickOn()
    vi.setSystemTime(1_000_000)
    handleRecorderPicked(7, { strategy: 'css', selector: '#new' })
    expect(state.pickModeEndedAt).toBe(1_000_000)
  })

  it('ends pick mode in the old guest when another recorder registers', async () => {
    await pickOn()
    guestSend.mockClear()
    registerRecorderWebContents(7)
    expect(state.pickMode).toBe(true)

    registerRecorderWebContents(12)
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
    expect(state.recorderWebContentsId).toBe(12)
  })
})
