import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import TestsList from '@components/TestsList'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunTestView, RunView } from '@foundation/run/runModel'
import { useTestClipboardStore } from '@foundation/Stores/testClipboardStore'
import { dispatchMenuCommand } from '@foundation/menuCommands'
import { onTestTrashed } from '@foundation/testFileActions'
import type { TestRow } from '@foundation/testKey'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const rows: TestRow[] = [
  {
    name: 'Login works',
    file: 'spec/login_spec.rb',
    testId: 't1',
    ownership: 'recorded',
    tags: []
  },
  {
    name: 'Cart totals',
    file: 'spec/cart_spec.rb',
    testId: 't2',
    ownership: 'codeOwnedWasRecorded',
    tags: []
  },
  { name: 'API health', file: 'spec/api_spec.rb', ownership: 'code', tags: [] }
]

const savedTests = [{ id: 't1', name: 'Login works', url: '', steps: [] }]

const api = {
  saveRecording: vi.fn(),
  getTests: vi.fn(),
  listProjectTests: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([]),
  setTestTags: vi.fn(),
  readTestFile: vi.fn(),
  pasteTestFile: vi.fn(),
  trashTest: vi.fn()
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
  api.getTests.mockResolvedValue(savedTests)
  api.listProjectTests.mockResolvedValue([])
  api.saveRecording.mockResolvedValue({ success: true })
  api.readTestFile.mockResolvedValue({ success: true, text: 'describe' })
  api.pasteTestFile.mockResolvedValue({ success: true, file: 'spec/api_copy_spec.rb' })
  api.trashTest.mockResolvedValue({ success: true })
  useTestClipboardStore.setState({ item: null })
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
  workers: 1,
  liveEvents: true,
  startedAt: '2026-10-31T10:00:00Z',
  phase: 'running',
  tests: Object.fromEntries(tests.map((x) => [x.id, x])),
  order: tests.map((x) => x.id),
  output: [],
  outputSize: 0,
  outputTrimmed: false,
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
    expect(screen.getByText('Login works').closest('[role=button]')).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('shows "Edited in code" for code and codeOwnedWasRecorded rows only', () => {
    setup()
    expect(screen.getAllByText('tests.editedInCode')).toHaveLength(2)
    const login = screen.getByText('Login works').closest('[role=button]') as HTMLElement
    expect(login).not.toHaveTextContent('tests.editedInCode')
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
      rows: [
        {
          name: 'Login works',
          file: 'spec/login_spec.rb',
          testId: 't1',
          ownership: 'recorded',
          missingFile: true,
          tags: []
        }
      ]
    })
    expect(screen.getByText('tests.fileMissing')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('tests.restore'))
    })
    expect(api.saveRecording).toHaveBeenCalledWith(expect.any(String), savedTests[0])
    expect(p.onSelect).not.toHaveBeenCalled()
  })

  it('shows the empty state', () => {
    setup({ rows: [] })
    expect(screen.getByText('tests.empty')).toBeInTheDocument()
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

describe('TestsList copy, paste, duplicate and delete', () => {
  // The shared ContextMenu renders menu items (role menuitem); dialogs keep plain buttons
  const menuLabels = (): string[] =>
    screen.queryAllByRole('menuitem').map((b) => b.textContent ?? '')
  const menuButton = (label: string): HTMLElement =>
    screen.queryAllByRole('menuitem', { name: label })[0] ??
    screen.getAllByRole('button', { name: label }).find((b) => b.tagName === 'BUTTON')!
  const codeClip = {
    kind: 'code' as const,
    name: 'API health',
    fileText: 'describe',
    relFile: 'spec/api_spec.rb'
  }

  it('right-clicking a row offers Copy, Paste, Duplicate and Delete; Paste needs a copy', () => {
    setup()
    fireEvent.contextMenu(screen.getByText('API health'))
    expect(menuLabels()).toEqual([
      'tests.menu.copy',
      'tests.menu.paste',
      'tests.menu.duplicate',
      'tests.menu.delete'
    ])
    expect(menuButton('tests.menu.paste')).toBeDisabled()
  })

  it('right-clicking the empty list area offers Paste only', () => {
    useTestClipboardStore.setState({ item: codeClip })
    setup()
    fireEvent.contextMenu(screen.getByRole('list'))
    expect(menuLabels()).toEqual(['tests.menu.paste'])
    expect(menuButton('tests.menu.paste')).toBeEnabled()
  })

  it('an empty list offers Paste on right-click too', async () => {
    useTestClipboardStore.setState({ item: codeClip })
    setup({ rows: [] })
    fireEvent.contextMenu(screen.getByTestId('tests-empty'))
    await act(async () => {
      fireEvent.click(menuButton('tests.menu.paste'))
    })
    expect(api.pasteTestFile).toHaveBeenCalledWith('/p', {
      text: 'describe',
      sourceFile: 'spec/api_spec.rb',
      name: 'API health copy'
    })
  })

  it("Copy reads a code row's file through main onto the app clipboard", async () => {
    setup()
    fireEvent.contextMenu(screen.getByText('API health'))
    await act(async () => {
      fireEvent.click(menuButton('tests.menu.copy'))
    })
    expect(api.readTestFile).toHaveBeenCalledWith('/p', 'spec/api_spec.rb')
    expect(useTestClipboardStore.getState().item).toEqual(codeClip)
    expect(document.querySelector('.fixed')).toBeNull()
  })

  it('Delete asks first, then moves the file to the Trash and announces it', async () => {
    const trashed = vi.fn()
    const off = onTestTrashed(trashed)
    setup()
    fireEvent.contextMenu(screen.getByText('API health'))
    fireEvent.click(menuButton('tests.menu.delete'))
    expect(screen.getByText('tests.delete.message')).toBeInTheDocument()
    expect(api.trashTest).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'tests.delete.confirm' }))
    })
    off()
    expect(api.trashTest).toHaveBeenCalledWith('/p', 'spec/api_spec.rb')
    expect(trashed).toHaveBeenCalledWith(['file:spec/api_spec.rb'])
  })

  it('cancelling Delete trashes nothing', () => {
    setup()
    fireEvent.contextMenu(screen.getByText('Login works'))
    fireEvent.click(menuButton('tests.menu.delete'))
    fireEvent.click(screen.getByRole('button', { name: 'tests.delete.cancel' }))
    expect(screen.queryByText('tests.delete.message')).toBeNull()
    expect(api.trashTest).not.toHaveBeenCalled()
  })

  it('a failed Delete announces nothing', async () => {
    api.trashTest.mockResolvedValue({ success: false, error: 'no' })
    const trashed = vi.fn()
    const off = onTestTrashed(trashed)
    setup()
    fireEvent.contextMenu(screen.getByText('API health'))
    fireEvent.click(menuButton('tests.menu.delete'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'tests.delete.confirm' }))
    })
    off()
    expect(trashed).not.toHaveBeenCalled()
  })

  describe('keys on the focused row', () => {
    const row = (name: string): HTMLElement => screen.getByText(name).closest('li')!

    it('Cmd+C copies, Ctrl+D duplicates', async () => {
      setup()
      await act(async () => {
        fireEvent.keyDown(row('API health'), { key: 'c', code: 'KeyC', metaKey: true })
      })
      expect(useTestClipboardStore.getState().item).toEqual(codeClip)
      await act(async () => {
        fireEvent.keyDown(row('API health'), { key: 'd', code: 'KeyD', ctrlKey: true })
      })
      expect(api.pasteTestFile).toHaveBeenCalledWith('/p', {
        text: 'describe',
        sourceFile: 'spec/api_spec.rb',
        nearFile: 'spec/api_spec.rb',
        name: 'API health copy'
      })
    })

    it('reads the typed Latin letter, and the key position on a non-Latin layout', async () => {
      setup()
      await act(async () => {
        // Dvorak types c on the I key: the letter wins
        fireEvent.keyDown(row('API health'), { key: 'c', code: 'KeyI', metaKey: true })
      })
      expect(useTestClipboardStore.getState().item).toEqual(codeClip)
      useTestClipboardStore.setState({ item: null })
      await act(async () => {
        // A Russian layout types с (Cyrillic) on the C key: the position is used
        fireEvent.keyDown(row('API health'), { key: 'с', code: 'KeyC', metaKey: true })
      })
      expect(useTestClipboardStore.getState().item).toEqual(codeClip)
      useTestClipboardStore.setState({ item: null })
      await act(async () => {
        // Dvorak types j on the C key: not a copy
        fireEvent.keyDown(row('API health'), { key: 'j', code: 'KeyC', metaKey: true })
      })
      expect(useTestClipboardStore.getState().item).toBeNull()
    })

    it('Cmd+V pastes next to the focused row', async () => {
      useTestClipboardStore.setState({ item: codeClip })
      setup()
      await act(async () => {
        fireEvent.keyDown(row('Login works'), { key: 'v', code: 'KeyV', metaKey: true })
      })
      expect(api.pasteTestFile).toHaveBeenCalledWith('/p', {
        text: 'describe',
        sourceFile: 'spec/api_spec.rb',
        nearFile: 'spec/login_spec.rb',
        name: 'API health copy'
      })
    })

    it('Delete and Cmd+Backspace ask to delete; plain Backspace does not', () => {
      setup()
      fireEvent.keyDown(row('API health'), { key: 'Backspace' })
      expect(screen.queryByText('tests.delete.message')).toBeNull()
      fireEvent.keyDown(row('API health'), { key: 'Delete' })
      expect(screen.getByText('tests.delete.message')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'tests.delete.cancel' }))
      fireEvent.keyDown(row('API health'), { key: 'Backspace', metaKey: true })
      expect(screen.getByText('tests.delete.message')).toBeInTheDocument()
    })

    it('keys typed into a field inside the list are left alone', async () => {
      setup({
        rows: [rows[2]],
        headerExtra: null
      })
      const input = document.createElement('input')
      row('API health').appendChild(input)
      await act(async () => {
        fireEvent.keyDown(input, { key: 'c', code: 'KeyC', metaKey: true })
        fireEvent.keyDown(input, { key: 'Delete' })
      })
      expect(api.readTestFile).not.toHaveBeenCalled()
      expect(screen.queryByText('tests.delete.message')).toBeNull()
    })
  })

  describe('the menu bar', () => {
    it('Duplicate, Copy and Delete act on the selected row only', async () => {
      // The reload after Duplicate lists the same tests again
      api.listProjectTests.mockResolvedValue(rows)
      setup({ selectedKey: 'file:spec/api_spec.rb' })
      await act(async () => {
        dispatchMenuCommand('duplicate-test')
      })
      expect(api.pasteTestFile).toHaveBeenCalledTimes(1)
      await act(async () => {
        dispatchMenuCommand('delete-test')
      })
      expect(screen.getByText('tests.delete.message')).toBeInTheDocument()
    })

    it('without a selection only Paste acts', async () => {
      useTestClipboardStore.setState({ item: codeClip })
      setup()
      await act(async () => {
        dispatchMenuCommand('copy-test')
        dispatchMenuCommand('duplicate-test')
        dispatchMenuCommand('delete-test')
      })
      expect(api.readTestFile).not.toHaveBeenCalled()
      expect(api.pasteTestFile).not.toHaveBeenCalled()
      expect(screen.queryByText('tests.delete.message')).toBeNull()
      await act(async () => {
        dispatchMenuCommand('paste-test')
      })
      expect(api.pasteTestFile).toHaveBeenCalledTimes(1)
    })

    it('does nothing without a project', async () => {
      useTestClipboardStore.setState({ item: codeClip })
      setup({ selectedKey: 'file:spec/api_spec.rb' })
      await act(async () => {
        useProjectStore.setState({ projectPath: null })
      })
      await act(async () => {
        dispatchMenuCommand('paste-test')
        dispatchMenuCommand('delete-test')
      })
      expect(api.pasteTestFile).not.toHaveBeenCalled()
      expect(screen.queryByText('tests.delete.message')).toBeNull()
    })
  })
})
