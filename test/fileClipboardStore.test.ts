import { describe, it, expect, beforeEach } from 'vitest'
import useFileClipboardStore, { copiedIn } from '@foundation/Stores/fileClipboardStore'

beforeEach(() => useFileClipboardStore.getState().clear())

describe('fileClipboardStore', () => {
  it('holds the last copied entry of a project', () => {
    useFileClipboardStore
      .getState()
      .copy({ projectPath: '/p', rel: 'spec', name: 'spec', kind: 'folder' })
    expect(copiedIn(useFileClipboardStore.getState(), '/p')?.rel).toBe('spec')
  })

  it('has nothing to paste in another project', () => {
    useFileClipboardStore
      .getState()
      .copy({ projectPath: '/p', rel: 'a.rb', name: 'a.rb', kind: 'file' })
    expect(copiedIn(useFileClipboardStore.getState(), '/q')).toBeNull()
  })

  it('forgets an entry once it, or a folder holding it, went to the Trash', () => {
    const store = useFileClipboardStore.getState()
    store.copy({ projectPath: '/p', rel: 'spec/a.rb', name: 'a.rb', kind: 'file' })
    store.forget('/p', 'specs')
    expect(useFileClipboardStore.getState().copied).not.toBeNull()
    store.forget('/p', 'spec')
    expect(useFileClipboardStore.getState().copied).toBeNull()
  })
})
