import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installRecordingState,
  resetRecordingOnWindowLoss
} from '../../src/main/handlers/recording/recordingState'
import { appState } from '../../src/main/handlers/appState'

const webContents = {}
const savedWindow = appState.mainWindow

beforeEach(() => {
  appState.mainWindow = { isDestroyed: () => false, webContents } as never
})
afterEach(() => {
  appState.mainWindow = savedWindow
})

describe('installRecordingState', () => {
  const setup = (): {
    send: (v: unknown, sender?: unknown) => void
    onChange: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
  } => {
    let handler: (e: unknown, v: unknown) => void = () => {}
    const on = vi.fn((_channel: string, h: typeof handler) => {
      handler = h
    })
    const onChange = vi.fn()
    installRecordingState({ on } as never, onChange)
    return { send: (v, sender = webContents) => handler({ sender }, v), onChange, on }
  }

  it('listens on its own channel, not the close-flush one', () => {
    expect(setup().on.mock.calls[0][0]).toBe('menu-recording')
  })

  it('reports true only for the boolean true', () => {
    const { send, onChange } = setup()
    send(true)
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it.each([false, 'true', 1, null, undefined, {}])('reports false for %j', (value) => {
    const { send, onChange } = setup()
    send(value)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('ignores anything but the main window', () => {
    const { send, onChange } = setup()
    send(true, {})
    appState.mainWindow = null
    send(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('resetRecordingOnWindowLoss', () => {
  const fakeWindow = (): {
    win: never
    winEvents: Record<string, () => void>
    wcEvents: Record<string, (d?: unknown) => void>
  } => {
    const winEvents: Record<string, () => void> = {}
    const wcEvents: Record<string, (d?: unknown) => void> = {}
    const win = {
      on: (e: string, h: () => void): void => {
        winEvents[e] = h
      },
      webContents: {
        on: (e: string, h: () => void): void => {
          wcEvents[e] = h
        }
      }
    }
    return { win: win as never, winEvents, wcEvents }
  }

  it('resets when the window closes, the renderer dies, or the main frame navigates', () => {
    const { win, winEvents, wcEvents } = fakeWindow()
    const reset = vi.fn()
    resetRecordingOnWindowLoss(win, reset)
    winEvents['closed']()
    wcEvents['render-process-gone']()
    wcEvents['did-start-navigation']({ isMainFrame: true, isSameDocument: false })
    expect(reset).toHaveBeenCalledTimes(3)
  })

  it('does not reset for subframes or in-app route changes', () => {
    const { win, wcEvents } = fakeWindow()
    const reset = vi.fn()
    resetRecordingOnWindowLoss(win, reset)
    wcEvents['did-start-navigation']({ isMainFrame: false })
    wcEvents['did-start-navigation']({ isMainFrame: true, isSameDocument: true })
    expect(reset).not.toHaveBeenCalled()
  })
})
