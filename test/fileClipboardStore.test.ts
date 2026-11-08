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

  it('follows a rename of the entry, or of a folder holding it', () => {
    const store = useFileClipboardStore.getState()
    store.copy({ projectPath: '/p', rel: 'spec/a.rb', name: 'a.rb', kind: 'file' })
    store.renamed('/p', 'specs', 'x')
    expect(useFileClipboardStore.getState().copied?.rel).toBe('spec/a.rb')
    store.renamed('/p', 'spec', 'tests')
    expect(useFileClipboardStore.getState().copied).toMatchObject({
      rel: 'tests/a.rb',
      name: 'a.rb'
    })
    store.renamed('/p', 'tests/a.rb', 'tests/b.rb')
    expect(useFileClipboardStore.getState().copied).toMatchObject({
      rel: 'tests/b.rb',
      name: 'b.rb'
    })
    store.renamed('/q', 'tests/b.rb', 'tests/c.rb')
    expect(useFileClipboardStore.getState().copied?.rel).toBe('tests/b.rb')
  })
})
