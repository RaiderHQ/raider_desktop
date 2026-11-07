import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useTestsListStore } from '@foundation/Stores/testsListStore'

const mockToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }))
vi.mock('i18next', () => ({ default: { t: (key: string): string => key } }))

const api = { listProjectTests: vi.fn(), getTests: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - Mocking window.api
  window.api = api
  useTestsListStore.setState({ rows: null, tests: [] })
})

describe('testsListStore.reload', () => {
  it('lists the project files as rows and keeps the recorded tests with their steps', async () => {
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'recorded', testId: 't1' },
      { file: 'spec/b_spec.rb', name: 'B', ownership: 'code' }
    ])
    const recorded = { id: 't1', name: 'A', url: '', steps: [], file: 'spec/a_spec.rb' }
    api.getTests.mockResolvedValue([recorded])
    await useTestsListStore.getState().reload()
    const { rows, tests } = useTestsListStore.getState()
    expect(rows?.map((r) => r.file)).toEqual(['spec/a_spec.rb', 'spec/b_spec.rb'])
    expect(tests).toEqual([recorded])
  })

  it('fills tags from the listing', async () => {
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'recorded', testId: 't1', tags: ['smoke'] }
    ])
    api.getTests.mockResolvedValue([])
    await useTestsListStore.getState().reload()
    expect(useTestsListStore.getState().rows?.[0].tags).toEqual(['smoke'])
  })

  it('falls back to an empty list when the first listing rejects, and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listProjectTests.mockRejectedValue(new Error('boom'))
    api.getTests.mockResolvedValue([])
    await useTestsListStore.getState().reload()
    expect(useTestsListStore.getState().rows).toEqual([])
    expect(mockToast.error).toHaveBeenCalledWith('tests.listFailed', { id: 'tests-list-failed' })
  })

  it('keeps the rows it has when a later listing rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'code' }
    ])
    api.getTests.mockResolvedValue([])
    await useTestsListStore.getState().reload()
    const rows = useTestsListStore.getState().rows
    api.listProjectTests.mockRejectedValue(new Error('boom'))
    await useTestsListStore.getState().reload()
    expect(useTestsListStore.getState().rows).toBe(rows)
    expect(mockToast.error).toHaveBeenCalledWith('tests.listFailed', { id: 'tests-list-failed' })
  })

  it('a stale reload that resolves late does not overwrite a newer one', async () => {
    let releaseFirst: (v: object[]) => void = () => {}
    api.listProjectTests
      .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
      .mockResolvedValueOnce([{ file: 'spec/new_spec.rb', name: 'New', ownership: 'code' }])
    api.getTests.mockResolvedValue([])
    const first = useTestsListStore.getState().reload()
    await useTestsListStore.getState().reload()
    releaseFirst([{ file: 'spec/old_spec.rb', name: 'Old', ownership: 'code' }])
    await first
    expect(useTestsListStore.getState().rows?.map((r) => r.name)).toEqual(['New'])
  })
})
