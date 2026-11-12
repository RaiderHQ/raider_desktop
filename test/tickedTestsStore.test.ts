import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTickedTestsStore } from '@foundation/Stores/tickedTestsStore'
import useProjectStore from '@foundation/Stores/projectStore'

const store = (): ReturnType<typeof useTickedTestsStore.getState> => useTickedTestsStore.getState()

beforeEach(() => {
  // @ts-expect-error - Mocking window.api: a project switch tells main
  window.api = {
    setActiveProject: vi.fn().mockResolvedValue({ success: true }),
    readDirectory: vi.fn().mockResolvedValue([])
  }
  useProjectStore.setState({ projectPath: '/p' })
  useTickedTestsStore.setState({ byProject: {} })
})

describe('tickedTestsStore', () => {
  it('toggle ticks a file, and unticks it again', () => {
    store().toggle('/p', 'spec/a_spec.rb')
    store().toggle('/p', 'spec/b_spec.rb')
    expect(store().ticked('/p')).toEqual(['spec/a_spec.rb', 'spec/b_spec.rb'])
    store().toggle('/p', 'spec/a_spec.rb')
    expect(store().ticked('/p')).toEqual(['spec/b_spec.rb'])
  })

  it('keeps ticks per project', () => {
    store().toggle('/p', 'spec/a_spec.rb')
    store().toggle('/q', 'spec/z_spec.rb')
    expect(store().ticked('/p')).toEqual(['spec/a_spec.rb'])
    expect(store().ticked('/q')).toEqual(['spec/z_spec.rb'])
    expect(store().ticked('/none')).toEqual([])
  })

  it('setRange ticks every file once, or unticks them', () => {
    store().toggle('/p', 'spec/b_spec.rb')
    store().setRange('/p', ['spec/a_spec.rb', 'spec/b_spec.rb', 'spec/c_spec.rb'], true)
    expect(store().ticked('/p')).toEqual(['spec/b_spec.rb', 'spec/a_spec.rb', 'spec/c_spec.rb'])
    store().setRange('/p', ['spec/a_spec.rb', 'spec/b_spec.rb'], false)
    expect(store().ticked('/p')).toEqual(['spec/c_spec.rb'])
  })

  it('clear unticks every file of the project only', () => {
    store().toggle('/p', 'spec/a_spec.rb')
    store().toggle('/q', 'spec/z_spec.rb')
    store().clear('/p')
    expect(store().ticked('/p')).toEqual([])
    expect(store().ticked('/q')).toEqual(['spec/z_spec.rb'])
  })

  it('prune drops the files that left the list', () => {
    store().setRange('/p', ['spec/a_spec.rb', 'spec/b_spec.rb'], true)
    const before = store().byProject
    store().prune('/p', ['spec/a_spec.rb', 'spec/b_spec.rb', 'spec/c_spec.rb'])
    // Nothing left the list: the same state, so subscribers don't re-render
    expect(store().byProject).toBe(before)
    store().prune('/p', ['spec/b_spec.rb'])
    expect(store().ticked('/p')).toEqual(['spec/b_spec.rb'])
  })

  it('a project switch clears every tick', () => {
    store().toggle('/p', 'spec/a_spec.rb')
    useProjectStore.setState({ projectPath: '/q' })
    expect(store().ticked('/p')).toEqual([])
    expect(store().byProject).toEqual({})
  })
})
