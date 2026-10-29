import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useTestsListStore } from '@foundation/Stores/testsListStore'

const mockToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }))
vi.mock('i18next', () => ({ default: { t: (key: string): string => key } }))

const api = { listProjectTests: vi.fn(), getSuites: vi.fn() }

const suite = (id: string, tests: object[]): object => ({ id, name: id, tests })

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - Mocking window.api
  window.api = api
  useTestsListStore.setState({ rows: null })
})

describe('testsListStore.reload', () => {
  it('lists a suite test with no file once, as legacy, with its suiteIds', async () => {
    api.listProjectTests.mockResolvedValue([])
    api.getSuites.mockResolvedValue([
      suite('s1', [{ id: 't1', name: 'Old', url: '', steps: [] }]),
      suite('s2', [{ id: 't1', name: 'Old', url: '', steps: [] }])
    ])
    await useTestsListStore.getState().reload()
    expect(useTestsListStore.getState().rows).toEqual([
      { name: 'Old', testId: 't1', ownership: 'legacy', suiteIds: ['s1', 's2'] }
    ])
  })

  it('does not duplicate a suite test that has a file', async () => {
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'recorded', testId: 't1' }
    ])
    api.getSuites.mockResolvedValue([
      suite('s1', [{ id: 't1', name: 'A', url: '', steps: [], file: 'spec/a_spec.rb' }])
    ])
    await useTestsListStore.getState().reload()
    const rows = useTestsListStore.getState().rows
    expect(rows).toHaveLength(1)
    expect(rows?.[0].ownership).toBe('recorded')
  })

  it('fills suiteIds on a file test listed in suites', async () => {
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'recorded', testId: 't1' },
      { file: 'spec/b_spec.rb', name: 'B', ownership: 'code' }
    ])
    api.getSuites.mockResolvedValue([suite('s1', [{ id: 't1', name: 'A', url: '', steps: [] }])])
    await useTestsListStore.getState().reload()
    const rows = useTestsListStore.getState().rows
    expect(rows?.find((r) => r.testId === 't1')?.suiteIds).toEqual(['s1'])
    expect(rows?.find((r) => r.file === 'spec/b_spec.rb')?.suiteIds).toEqual([])
  })

  it('falls back to an empty list when the first listing rejects, and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listProjectTests.mockRejectedValue(new Error('boom'))
    api.getSuites.mockResolvedValue([])
    await useTestsListStore.getState().reload()
    expect(useTestsListStore.getState().rows).toEqual([])
    expect(mockToast.error).toHaveBeenCalledWith('tests.listFailed', { id: 'tests-list-failed' })
  })

  it('keeps the rows it has when a later listing rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listProjectTests.mockResolvedValue([
      { file: 'spec/a_spec.rb', name: 'A', ownership: 'code' }
    ])
    api.getSuites.mockResolvedValue([])
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
    api.getSuites.mockResolvedValue([])
    const first = useTestsListStore.getState().reload()
    await useTestsListStore.getState().reload()
    releaseFirst([{ file: 'spec/old_spec.rb', name: 'Old', ownership: 'code' }])
    await first
    expect(useTestsListStore.getState().rows?.map((r) => r.name)).toEqual(['New'])
  })
})
