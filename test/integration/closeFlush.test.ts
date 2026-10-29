import { EventEmitter } from 'events'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installCloseFlush } from '../../src/main/handlers/recording/closeFlush'

class FakeWindow extends EventEmitter {
  webContents = { send: vi.fn() }
  destroyed = false
  close = vi.fn(() => {
    // Closing for real fires `close` again, like Electron does
    const event = { preventDefault: vi.fn() }
    this.emit('close', event)
    if (!event.preventDefault.mock.calls.length) this.destroyed = true
  })
  isDestroyed = (): boolean => this.destroyed
}

let win: FakeWindow
let ipc: EventEmitter
const sender = {}

const tryClose = (): { preventDefault: ReturnType<typeof vi.fn> } => {
  const event = { preventDefault: vi.fn() }
  win.emit('close', event)
  return event
}

beforeEach(() => {
  vi.useFakeTimers()
  win = new FakeWindow()
  ipc = new EventEmitter()
  installCloseFlush(win as never, ipc as never)
})

afterEach(() => vi.useRealTimers())

describe('closeFlush', () => {
  it('holds the close while recording and asks the page to save', () => {
    ipc.emit('recording-state', { sender }, true)
    const event = tryClose()
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith('flush-recording')
    expect(win.close).not.toHaveBeenCalled()
  })

  it('closes once the page says it saved', () => {
    ipc.emit('recording-state', { sender }, true)
    tryClose()
    ipc.emit('flush-recording-done', { sender })
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(win.isDestroyed()).toBe(true)
    // The timer is gone: no second close later
    vi.advanceTimersByTime(5000)
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('closes after 3000 ms when the page never answers', () => {
    ipc.emit('recording-state', { sender }, true)
    tryClose()
    vi.advanceTimersByTime(2999)
    expect(win.close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(win.isDestroyed()).toBe(true)
  })

  it('a second close while saving waits for the same save', () => {
    ipc.emit('recording-state', { sender }, true)
    tryClose()
    const again = tryClose()
    expect(again.preventDefault).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('lets the window close when nothing is recording', () => {
    const event = tryClose()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('lets the window close once the recording stopped', () => {
    ipc.emit('recording-state', { sender }, true)
    ipc.emit('recording-state', { sender }, false)
    const event = tryClose()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('closes with the given close, so a quit can carry on', () => {
    const quit = vi.fn()
    const other = new FakeWindow()
    const otherIpc = new EventEmitter()
    installCloseFlush(other as never, otherIpc as never, { close: quit })
    otherIpc.emit('recording-state', { sender }, true)
    other.emit('close', { preventDefault: vi.fn() })
    otherIpc.emit('flush-recording-done', { sender })
    expect(quit).toHaveBeenCalledTimes(1)
    expect(other.close).not.toHaveBeenCalled()
  })
})
