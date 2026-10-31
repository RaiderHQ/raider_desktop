import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import TestsList from '@components/TestsList'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunTestView, RunView } from '@foundation/run/runModel'
import type { TestRow } from '@foundation/testKey'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const rows: TestRow[] = [
  { name: 'Login works', file: 'spec/login_spec.rb', testId: 't1', ownership: 'recorded', suiteIds: ['s1'] },
  { name: 'Cart totals', file: 'spec/cart_spec.rb', testId: 't2', ownership: 'codeOwnedWasRecorded', suiteIds: [] },
  { name: 'API health', file: 'spec/api_spec.rb', ownership: 'code', suiteIds: [] },
  { name: 'Old one', testId: 't9', ownership: 'legacy', suiteIds: ['s1'] }
]

const suites = [
  { id: 's1', name: 'Smoke', tests: [{ id: 't1', name: 'Login works', url: '', steps: [] }] }
]

const api = {
  saveRecording: vi.fn(),
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([])
}

const setup = (over: Partial<React.ComponentProps<typeof TestsList>> = {}) => {
  const props = {
    rows,
    selectedKey: null,
    onSelect: vi.fn(),
    onNewTest: vi.fn(),
    ...over
  }
  render(<TestsList {...props} />)
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getSuites.mockResolvedValue(suites)
  api.listProjectTests.mockResolvedValue([])
  api.saveRecording.mockResolvedValue({ success: true })
  // @ts-expect-error - Mocking window.api
  window.api = api
  useTestsListStore.setState({ rows: null })
  useRunStore.setState({ run: null, origin: null, isActive: false })
  useProjectStore.setState({ projectPath: '/p' })
})

afterEach(() => useProjectStore.setState({ layout: null, projectPath: null }))

const runTest = (id: string, file: string, state: RunTestView['state']): RunTestView => ({
  id,
  file,
  line: 1,
  description: id,
  fullName: id,
  state
})

const runWith = (tests: RunTestView[], over: Partial<RunView> = {}): RunView => ({
  runId: 'r1',
  projectPath: '/p',
  scope: { kind: 'all' },
  framework: 'rspec',
  workers: 1,
  liveEvents: true,
  startedAt: '2026-10-31T10:00:00Z',
  phase: 'running',
  tests: Object.fromEntries(tests.map((x) => [x.id, x])),
  order: tests.map((x) => x.id),
  output: [],
  finished: null,
  ...over
})

describe('TestsList', () => {
  it('clicking a row selects it by key, with no Edit or View buttons', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Login works'))
    expect(p.onSelect).toHaveBeenCalledWith('id:t1')
    fireEvent.click(screen.getByText('API health'))
    expect(p.onSelect).toHaveBeenCalledWith('file:spec/api_spec.rb')
    expect(screen.queryByText('tests.edit')).not.toBeInTheDocument()
    expect(screen.queryByText('tests.view')).not.toBeInTheDocument()
  })

  it('selects with Enter and Space', () => {
    const p = setup()
    const row = screen.getByText('Login works').closest('[role=button]') as HTMLElement
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(p.onSelect).toHaveBeenCalledTimes(2)
  })

  it('marks the selected row with aria-current', () => {
    setup({ selectedKey: 'id:t2' })
    const sel = screen.getByText('Cart totals').closest('[role=button]')
    expect(sel).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Login works').closest('[role=button]')).not.toHaveAttribute('aria-current')
  })

  it('shows "Edited in code" for code and codeOwnedWasRecorded rows only', () => {
    setup()
    expect(screen.getAllByText('tests.editedInCode')).toHaveLength(2)
    const login = screen.getByText('Login works').closest('[role=button]') as HTMLElement
    expect(login).not.toHaveTextContent('tests.editedInCode')
    const legacy = screen.getByText('Old one').closest('[role=button]') as HTMLElement
    expect(legacy).not.toHaveTextContent('tests.editedInCode')
  })

  it('lists and selects a legacy row', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Old one'))
    expect(p.onSelect).toHaveBeenCalledWith('id:t9')
  })

  it('gives every row an empty status slot', () => {
    setup()
    const slots = screen.getAllByTestId('row-status')
    expect(slots).toHaveLength(rows.length)
    slots.forEach((s) => expect(s).toBeEmptyDOMElement())
  })

  it("shows each file's status in the last run", () => {
    useRunStore.setState({
      run: runWith([
        runTest('a', 'spec/login_spec.rb', 'passed'),
        runTest('b', 'spec/login_spec.rb', 'failed'),
        runTest('c', 'spec/cart_spec.rb', 'started')
      ])
    })
    setup()
    const slots = screen.getAllByTestId('row-status')
    expect(slots[0]).toHaveTextContent('run.state.failed')
    expect(slots[1]).toHaveTextContent('run.state.started')
    expect(slots[2]).toBeEmptyDOMElement()
    expect(slots[3]).toBeEmptyDOMElement()
  })

  it('shows no status from a run in another project', () => {
    useRunStore.setState({
      run: runWith([runTest('b', 'spec/login_spec.rb', 'failed')], { projectPath: '/other' })
    })
    setup()
    screen.getAllByTestId('row-status').forEach((s) => expect(s).toBeEmptyDOMElement())
  })

  it('New test calls onNewTest', () => {
    const p = setup()
    fireEvent.click(screen.getByText('tests.newTest'))
    expect(p.onNewTest).toHaveBeenCalled()
  })

  it('renders headerExtra', () => {
    setup({ headerExtra: <span>extra</span> })
    expect(screen.getByText('extra')).toBeInTheDocument()
  })

  it('a missing-file row keeps Restore, which does not select the row', async () => {
    const p = setup({
      rows: [{ name: 'Login works', file: 'spec/login_spec.rb', testId: 't1', ownership: 'recorded', missingFile: true, suiteIds: ['s1'] }]
    })
    expect(screen.getByText('tests.fileMissing')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('tests.restore'))
    })
    expect(api.saveRecording).toHaveBeenCalledWith('s1', suites[0].tests[0])
    expect(p.onSelect).not.toHaveBeenCalled()
  })

  it('shows the empty state', () => {
    setup({ rows: [] })
    expect(screen.getByText('tests.empty')).toBeInTheDocument()
  })

  it('a Cucumber project explains where its tests are', () => {
    useProjectStore.setState({
      layout: { framework: 'cucumber', automation: 'selenium', recordable: true } as never
    })
    setup({ rows: [] })
    expect(screen.getByText('tests.cucumber')).toBeInTheDocument()
    expect(screen.queryByText('tests.empty')).not.toBeInTheDocument()
  })

  it('a project Raider cannot record into does not offer to record one', () => {
    useProjectStore.setState({
      layout: { framework: 'rspec', automation: 'selenium', recordable: false } as never
    })
    setup({ rows: [] })
    expect(screen.getByText('tests.emptyNoRecording')).toBeInTheDocument()
  })

  it('shows no raw paths', () => {
    setup()
    expect(document.body.textContent).not.toMatch(/spec\/|_spec\.rb/)
  })
})
