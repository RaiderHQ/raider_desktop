import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mainSend = vi.fn()
const guestSend = vi.fn()
let guest: (EventEmitter & { send: typeof guestSend; isDestroyed: () => boolean }) | null = null

vi.mock('electron', () => ({
  webContents: {
    fromId: (id: number): unknown => (id === 7 ? guest : undefined)
  }
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    pickMode: false,
    recorderWebContentsId: null,
    activeTraceDir: null,
    mainWindow: { webContents: { id: 1, send: (...args: unknown[]): unknown => mainSend(...args) } }
  }
}))

import {
  setPickMode,
  handleSetPickMode,
  handleRecorderPicked,
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

describe('pick mode in main', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPickMode(false)
    vi.clearAllMocks()
    guest = Object.assign(new EventEmitter(), { send: guestSend, isDestroyed: () => false })
    state.recorderWebContentsId = 7
  })

  it('turns pick mode on in state and in the guest', () => {
    expect(setPickMode(true)).toEqual({ success: true })
    expect(state.pickMode).toBe(true)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', true)
  })

  it('fails and stays off with no guest', () => {
    state.recorderWebContentsId = null
    expect(setPickMode(true)).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
  })

  it('fails and stays off when the guest is gone', () => {
    state.recorderWebContentsId = 9
    expect(setPickMode(true)).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
  })

  it('only lets the app window switch pick mode', () => {
    expect(handleSetPickMode(7, true)).toEqual({ success: false })
    expect(state.pickMode).toBe(false)
    expect(handleSetPickMode(1, true)).toEqual({ success: true })
    expect(state.pickMode).toBe(true)
    expect(handleSetPickMode(7, false)).toEqual({ success: false })
    expect(state.pickMode).toBe(true)
  })

  it('ignores a pick from another sender', () => {
    setPickMode(true)
    handleRecorderPicked(8, { strategy: 'css', selector: '#new', innerText: 'Save' })
    expect(picked()).toEqual([])
    expect(state.pickMode).toBe(true)
  })

  it('ignores a pick from the guest outside pick mode', () => {
    handleRecorderPicked(7, { strategy: 'css', selector: '#new', innerText: 'Save' })
    handleRecorderPickCancelled(7)
    expect(picked()).toEqual([])
  })

  it('sends the picked element to the app and ends pick mode', () => {
    setPickMode(true)
    guestSend.mockClear()
    handleRecorderPicked(7, { strategy: 'css', selector: '#new', innerText: 'Save' })
    expect(picked()).toEqual([
      ['recorder-picked', { element: { strategy: 'css', value: '#new', label: 'Save' } }]
    ])
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
  })

  it('keeps a well-formed locator and drops hints that are not text', () => {
    setPickMode(true)
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

  it.each([null, 'x', {}, { strategy: 'name', selector: 'q' }, { strategy: 'css', selector: '' }])(
    'ignores an unusable pick %j and keeps picking',
    (data) => {
      setPickMode(true)
      handleRecorderPicked(7, data)
      expect(picked()).toEqual([])
      expect(state.pickMode).toBe(true)
    }
  )

  it('sends a cancel to the app and ends pick mode', () => {
    setPickMode(true)
    handleRecorderPickCancelled(8)
    expect(picked()).toEqual([])
    handleRecorderPickCancelled(7)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
    expect(state.pickMode).toBe(false)
  })

  it('ends pick mode as a cancel when the guest navigates', () => {
    setPickMode(true)
    guest!.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(state.pickMode).toBe(false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
  })

  it('keeps picking through same-document and subframe navigations', () => {
    setPickMode(true)
    guest!.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    guest!.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(state.pickMode).toBe(true)
  })

  it('ends pick mode when the guest is destroyed', () => {
    setPickMode(true)
    guest!.emit('destroyed')
    expect(state.pickMode).toBe(false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
  })

  it('stops watching the guest once pick mode ends', () => {
    setPickMode(true)
    setPickMode(false)
    expect(guest!.listenerCount('did-start-navigation')).toBe(0)
    expect(guest!.listenerCount('destroyed')).toBe(0)
  })

  it('ends pick mode when recording stops, before forgetting the guest', () => {
    setPickMode(true)
    guestSend.mockClear()
    stopRecordingMain()
    expect(state.pickMode).toBe(false)
    expect(guestSend).toHaveBeenCalledWith('recorder-pick-mode', false)
    expect(picked()).toEqual([['recorder-picked', { cancelled: true }]])
    expect(state.recorderWebContentsId).toBeNull()
  })

  it('notes when pick mode ended, so main can ignore the rest of a double-click', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    setPickMode(true)
    handleRecorderPicked(7, { strategy: 'css', selector: '#new' })
    expect(state.pickModeEndedAt).toBe(1_000_000)
    vi.useRealTimers()
  })

  it('ends pick mode in the old guest when another recorder registers', () => {
    setPickMode(true)
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
