import { describe, it, expect } from 'vitest'
import useTitleStore from '@foundation/Stores/titleStore'

describe('titleStore', () => {
  it('holds a document and clears it', () => {
    useTitleStore.getState().setDocument({ name: 'a.rb', edited: true })
    expect(useTitleStore.getState().document).toEqual({ name: 'a.rb', edited: true })
    useTitleStore.getState().setDocument(null)
    expect(useTitleStore.getState().document).toBeNull()
  })
})
