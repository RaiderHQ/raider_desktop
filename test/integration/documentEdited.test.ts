import { EventEmitter } from 'events'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installDocumentEdited } from '../../src/main/handlers/documentEdited'

class FakeWindow extends EventEmitter {
  setDocumentEdited = vi.fn()
  isDestroyed = (): boolean => false
  webContents = { send: vi.fn() }
}

let win: FakeWindow
let ipc: EventEmitter
let handle: ReturnType<typeof installDocumentEdited>
const sender = {}
const showMessageBoxSync = vi.fn()
const close = vi.fn()

beforeEach(() => {
  win = new FakeWindow()
  ipc = new EventEmitter()
  showMessageBoxSync.mockReset()
  close.mockReset()
  handle = installDocumentEdited(win as never, ipc as never, {
    dialog: { showMessageBoxSync },
    close,
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
const edit = (): boolean => ipc.emit('document-edited', { sender }, true, 'login_spec.rb')

describe('documentEdited', () => {
  it('marks the window edited from the page', () => {
    ipc.emit('document-edited', { sender }, true, 'login_spec.rb')
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(true)
    expect(handle.state()).toEqual({ edited: true, name: 'login_spec.rb' })
    ipc.emit('document-edited', { sender }, false, 'login_spec.rb')
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false)
  })

  it('ignores a non-boolean flag and a non-string name', () => {
    ipc.emit('document-edited', { sender }, 'yes', 42)
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false)
    expect(handle.state()).toEqual({ edited: false, name: '' })
  })

  it('caps the name at 200 characters', () => {
    ipc.emit('document-edited', { sender }, true, 'x'.repeat(500))
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
    ipc.emit('document-edited', { sender }, false, 'login_spec.rb')
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
    ipc.emit('document-edited', { sender }, false, 'login_spec.rb')
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
})
