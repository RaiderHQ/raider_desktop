import { EventEmitter } from 'events'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { installDocumentEdited } from '../../src/main/handlers/documentEdited'

class FakeWindow extends EventEmitter {
  setDocumentEdited = vi.fn()
  isDestroyed = (): boolean => false
}

let win: FakeWindow
let ipc: EventEmitter
let handle: ReturnType<typeof installDocumentEdited>
const sender = {}

beforeEach(() => {
  win = new FakeWindow()
  ipc = new EventEmitter()
  handle = installDocumentEdited(win as never, ipc as never)
})

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
