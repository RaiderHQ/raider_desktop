import { EventEmitter } from 'events'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installDocumentEdited } from '../../src/main/handlers/documentEdited'
import { installCloseFlush } from '../../src/main/handlers/recording/closeFlush'

class FakeWindow extends EventEmitter {
  setDocumentEdited = vi.fn()
  destroyed = false
  isDestroyed = (): boolean => this.destroyed
  webContents = { send: vi.fn() }
}

let win: FakeWindow
let ipc: EventEmitter
let handle: ReturnType<typeof installDocumentEdited>
const showMessageBoxSync = vi.fn()
const close = vi.fn()
const onCancel = vi.fn()

beforeEach(() => {
  win = new FakeWindow()
  ipc = new EventEmitter()
  showMessageBoxSync.mockReset()
  close.mockReset()
  onCancel.mockReset()
  handle = installDocumentEdited(win as never, ipc as never, {
    dialog: { showMessageBoxSync },
    close,
    onCancel,
    timeoutMs: 100
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const requestClose = (): { preventDefault: ReturnType<typeof vi.fn> } => {
  const event = { preventDefault: vi.fn() }
  win.emit('close', event)
  return event
}
const edit = (): boolean =>
  ipc.emit('document-edited', { sender: win.webContents }, true, 'login_spec.rb')

describe('documentEdited', () => {
  it('marks the window edited from the page', () => {
    ipc.emit('document-edited', { sender: win.webContents }, true, 'login_spec.rb')
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(true)
    expect(handle.state()).toEqual({ edited: true, name: 'login_spec.rb' })
    ipc.emit('document-edited', { sender: win.webContents }, false, 'login_spec.rb')
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false)
  })

  it('ignores a non-boolean flag and a non-string name', () => {
    ipc.emit('document-edited', { sender: win.webContents }, 'yes', 42)
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false)
    expect(handle.state()).toEqual({ edited: false, name: '' })
  })

  it('ignores reports from any page but its own window', () => {
    ipc.emit('document-edited', { sender: {} }, true, 'login_spec.rb')
    expect(win.setDocumentEdited).not.toHaveBeenCalled()
    expect(handle.state().edited).toBe(false)
  })

  it('caps the name at 200 characters', () => {
    ipc.emit('document-edited', { sender: win.webContents }, true, 'x'.repeat(500))
    expect(handle.state().name).toHaveLength(200)
  })
})

describe('closing with unsaved changes', () => {
  it('lets a clean window close', () => {
    const event = requestClose()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('asks before closing an edited window', () => {
    edit()
    showMessageBoxSync.mockReturnValue(2)
    const event = requestClose()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      win,
      expect.objectContaining({
        message: 'Save changes to login_spec.rb?',
        buttons: ['Save', "Don't save", 'Cancel'],
        defaultId: 0,
        cancelId: 2
      })
    )
  })

  it('Save sends the save command and closes once the page reports clean', () => {
    edit()
    showMessageBoxSync.mockReturnValue(0)
    requestClose()
    expect(win.webContents.send).toHaveBeenCalledWith('menu-command', 'save')
    expect(close).not.toHaveBeenCalled()
    ipc.emit('document-edited', { sender: win.webContents }, false, 'login_spec.rb')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("Don't save closes at once", () => {
    edit()
    showMessageBoxSync.mockReturnValue(1)
    requestClose()
    expect(close).toHaveBeenCalledTimes(1)
    expect(handle.state().edited).toBe(false)
    expect(requestClose().preventDefault).not.toHaveBeenCalled()
  })

  it('Cancel keeps the window open', () => {
    edit()
    showMessageBoxSync.mockReturnValue(2)
    requestClose()
    expect(close).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
    requestClose()
    expect(showMessageBoxSync).toHaveBeenCalledTimes(2)
  })

  it('stays open when the page never reports clean', () => {
    vi.useFakeTimers()
    edit()
    showMessageBoxSync.mockReturnValue(0)
    requestClose()
    vi.advanceTimersByTime(200)
    expect(close).not.toHaveBeenCalled()
    ipc.emit('document-edited', { sender: win.webContents }, false, 'login_spec.rb')
    expect(close).not.toHaveBeenCalled()
  })

  it('a second close during the dialog is ignored', () => {
    edit()
    let second: ReturnType<typeof requestClose> | undefined
    showMessageBoxSync.mockImplementation(() => {
      second = requestClose()
      return 2
    })
    requestClose()
    expect(showMessageBoxSync).toHaveBeenCalledTimes(1)
    expect(second?.preventDefault).toHaveBeenCalled()
  })

  it('a second close while waiting for the save is ignored', () => {
    edit()
    showMessageBoxSync.mockReturnValue(0)
    requestClose()
    expect(requestClose().preventDefault).toHaveBeenCalled()
    expect(showMessageBoxSync).toHaveBeenCalledTimes(1)
  })

  it('leaves a close another listener already holds alone', () => {
    edit()
    const event = { preventDefault: vi.fn(), defaultPrevented: true }
    win.emit('close', event)
    expect(showMessageBoxSync).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('markClean lets the next close through without asking', () => {
    edit()
    handle.markClean()
    expect(requestClose().preventDefault).not.toHaveBeenCalled()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('Cancel reports the cancel', () => {
    edit()
    showMessageBoxSync.mockReturnValue(2)
    requestClose()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('a window destroyed while Save waits is not closed and nothing throws', () => {
    vi.useFakeTimers()
    edit()
    showMessageBoxSync.mockReturnValue(0)
    requestClose()
    win.destroyed = true
    expect(() => {
      ipc.emit('document-edited', { sender: win.webContents }, false, 'login_spec.rb')
      vi.advanceTimersByTime(200)
    }).not.toThrow()
    expect(close).not.toHaveBeenCalled()
  })
})

describe('the close guard with the recording flush (wired like src/main/index.ts)', () => {
  /** A window whose close events record preventDefault like Electron's */
  class WiredWindow extends FakeWindow {
    close = vi.fn(() => this.closeOnce())
    closeOnce(): { defaultPrevented: boolean } {
      const event = {
        defaultPrevented: false,
        preventDefault(): void {
          this.defaultPrevented = true
        }
      }
      this.emit('close', event)
      if (!event.defaultPrevented) this.destroyed = true
      return event
    }
  }

  let wired: WiredWindow
  let wiredIpc: EventEmitter
  let quitting: boolean
  const quit = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    wired = new WiredWindow()
    wiredIpc = new EventEmitter()
    quitting = false
    quit.mockReset()
    showMessageBoxSync.mockReset()
    const closeOrQuit = (): void => (quitting ? quit() : wired.close())
    const guard = { markClean: (): void => {} }
    installCloseFlush(wired as never, wiredIpc as never, {
      close: closeOrQuit,
      onBeforeClose: () => guard.markClean()
    })
    guard.markClean = installDocumentEdited(wired as never, wiredIpc as never, {
      dialog: { showMessageBoxSync },
      close: closeOrQuit,
      onCancel: () => {
        quitting = false
      }
    }).markClean
  })

  const from = (): { sender: unknown } => ({ sender: wired.webContents })
  const editWired = (): boolean => wiredIpc.emit('document-edited', from(), true, 'Login')
  const recordWired = (): boolean => wiredIpc.emit('recording-state', from(), true)

  it('closing while recording takes the flush path only, with no dialog', () => {
    recordWired()
    editWired()
    expect(wired.closeOnce().defaultPrevented).toBe(true)
    expect(wired.webContents.send).toHaveBeenCalledWith('flush-recording')
    expect(showMessageBoxSync).not.toHaveBeenCalled()
    wiredIpc.emit('flush-recording-done', from())
    // The flush's own close is not asked about the recording it just saved
    expect(showMessageBoxSync).not.toHaveBeenCalled()
    expect(wired.isDestroyed()).toBe(true)
  })

  it("Save while recording is never the guard's", () => {
    recordWired()
    editWired()
    showMessageBoxSync.mockReturnValue(0)
    wired.closeOnce()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
    expect(wired.webContents.send).not.toHaveBeenCalledWith('menu-command', 'save')
  })

  it('closing with a dirty editor and no recording shows the dialog only', () => {
    editWired()
    showMessageBoxSync.mockReturnValue(2)
    expect(wired.closeOnce().defaultPrevented).toBe(true)
    expect(showMessageBoxSync).toHaveBeenCalledTimes(1)
    expect(wired.webContents.send).not.toHaveBeenCalledWith('flush-recording')
  })

  it("Don't save during a quit quits", () => {
    editWired()
    quitting = true
    showMessageBoxSync.mockReturnValue(1)
    wired.closeOnce()
    expect(quit).toHaveBeenCalledTimes(1)
    expect(wired.close).not.toHaveBeenCalled()
  })

  it('Cancel after a quit, then a plain close, does not quit', () => {
    editWired()
    quitting = true
    showMessageBoxSync.mockReturnValueOnce(2).mockReturnValueOnce(1)
    wired.closeOnce()
    expect(quit).not.toHaveBeenCalled()
    wired.closeOnce()
    expect(quit).not.toHaveBeenCalled()
    expect(wired.close).toHaveBeenCalledTimes(1)
    expect(wired.isDestroyed()).toBe(true)
  })
})
