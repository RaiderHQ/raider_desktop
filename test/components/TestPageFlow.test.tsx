import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ipcSubscriptions } from '../helpers/ipcSubscriptions'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TestPage from '@components/TestPage'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { TestRow } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'
import en from '@assets/translations/en.json'

// en.json with i18next's count plurals (key_one / key_other), so the wording itself is checked
const translate = (key: string, options: Record<string, string | number> = {}): string => {
  const lookup = (k: string): unknown =>
    k.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
  const count = options.count
  const value =
    typeof count === 'number'
      ? (lookup(`${key}_${count === 1 ? 'one' : 'other'}`) ?? lookup(key))
      : lookup(key)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))
const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const nav = (id: string): Test['steps'][number] => ({
  id,
  kind: 'navigate',
  url: `https://x.test/${id}`
})
const check = (id: string): Test['steps'][number] => ({
  id,
  kind: 'assert',
  check: 'displayed',
  element: { strategy: 'css', value: '#ok' }
})
const base: Test = {
  id: 't1',
  name: 'Book room',
  url: 'https://x.test',
  steps: [nav('a')],
  ownership: 'recorded',
  file: 'spec/book_room_spec.rb'
}

const api = {
  getTests: vi.fn(),
  listProjectTests: vi.fn(),
  saveRecording: vi.fn(),
  deleteTest: vi.fn(),
  exportTest: vi.fn(),
  stopRecordingMain: vi.fn(),
  saveTrace: vi.fn(),
  renderStep: vi.fn(),
  cancelReplay: vi.fn(),
  setRecordingState: vi.fn(),
  setMenuRecording: vi.fn(),
  onFlushRecording: vi.fn(() => (): void => {}),
  flushRecordingDone: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue({ success: false }),
  readImage: vi.fn().mockResolvedValue({ success: false }),
  mapFailedStep: vi.fn().mockResolvedValue({ none: 'noMap' }),
  loadTrace: vi.fn().mockResolvedValue({ success: true, trace: [] }),
  setTestTags: vi.fn(),
  flowsReady: vi.fn(),
  convertToFlow: vi.fn(),
  getProjectConfig: vi.fn().mockResolvedValue({ success: false })
}

const Where = (): ReactElement => {
  const location = useLocation()
  return <div data-testid="where">{location.pathname}</div>
}

const rowOf = (test: Test, over: Partial<TestRow> = {}): TestRow => ({
  name: test.name,
  testId: test.id,
  file: test.file,
  ownership: 'recorded',
  tags: [],
  ...over
})

const renderPage = (test: Test, over: Partial<TestRow> = {}): void => {
  api.getTests.mockResolvedValue([test])
  render(
    <MemoryRouter initialEntries={['/overview/tests/x']}>
      <Routes>
        <Route path="/overview/tests/:testKey" element={<TestPage row={rowOf(test, over)} />} />
      </Routes>
      <Where />
    </MemoryRouter>
  )
}

const openMore = async (test: Test): Promise<void> => {
  await screen.findByDisplayValue(test.name)
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useTestsListStore.setState({ rows: null, tests: [] })
  api.listProjectTests.mockResolvedValue([])
  api.flowsReady.mockResolvedValue(true)
  api.saveRecording.mockResolvedValue({ success: true })
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  // @ts-expect-error - Mocking window.api
  window.api = api
  Object.assign(window.api, ipcSubscriptions(listeners))
  useRecorderStore.getState().resetForProject()
  useRunStore.setState({ run: null, origin: null, isActive: false })
  useProjectStore.setState({ layout: null, projectPath: '/p' })
})

afterEach(() => useProjectStore.setState({ projectPath: null }))

describe('Save as flow', () => {
  it('reads "Save as flow" for a test without checks and converts at once', async () => {
    api.convertToFlow.mockResolvedValue({
      success: true,
      test: { ...base, id: 'new-flow', kind: 'flow', file: 'flows/book_room_flow.rb' }
    })
    renderPage(base)
    await openMore(base)
    const item = await screen.findByRole('menuitem', { name: 'Save as flow' })
    await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled'))
    expect(item).toHaveAttribute('title', en.tooltips.testPage.saveAsFlow)
    fireEvent.click(item)

    await waitFor(() => expect(api.convertToFlow).toHaveBeenCalledWith('/p', { testId: 't1' }))
    // The test is written first, so main converts what the page shows
    expect(api.saveRecording.mock.invocationCallOrder[0]).toBeLessThan(
      api.convertToFlow.mock.invocationCallOrder[0]
    )
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).not.toBe('/overview/tests/x')
    )
    expect(mockToast.success).toHaveBeenCalledWith('Saved as a flow in flows/book_room_flow.rb')
  })

  it('reads "Remove 1 check and save as flow" and confirms before dropping it', async () => {
    const test = { ...base, steps: [nav('a'), check('c1')] }
    api.convertToFlow.mockResolvedValue({
      success: true,
      test: { ...test, id: 'n2', kind: 'flow', file: 'flows/book_room_flow.rb' }
    })
    renderPage(test)
    await openMore(test)
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Remove 1 check and save as flow' })
    )

    expect(api.convertToFlow).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        "A flow has no checks. The flow leaves out this test's check; the test keeps it."
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove and save' }))
    await waitFor(() =>
      expect(api.convertToFlow).toHaveBeenCalledWith('/p', { testId: 't1', dropChecks: true })
    )
  })

  it('says how many checks go, in the plural', async () => {
    const test = { ...base, steps: [nav('a'), check('c1'), check('c2')] }
    renderPage(test)
    await openMore(test)
    expect(
      await screen.findByRole('menuitem', { name: 'Remove 2 checks and save as flow' })
    ).toBeInTheDocument()
  })

  it('cancelling the confirm converts nothing', async () => {
    const test = { ...base, steps: [check('c1')] }
    renderPage(test)
    await openMore(test)
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Remove 1 check and save as flow' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.convertToFlow).not.toHaveBeenCalled()
  })

  it('is disabled with the set-up tooltip when flows are not set up', async () => {
    api.flowsReady.mockResolvedValue(false)
    renderPage(base)
    await openMore(base)
    const item = await screen.findByRole('menuitem', { name: 'Save as flow' })
    await waitFor(() => expect(api.flowsReady).toHaveBeenCalled())
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAttribute('title', en.tooltips.tests.flowsNotReady)
    fireEvent.click(item)
    expect(api.convertToFlow).not.toHaveBeenCalled()
  })

  it('is not offered for a test changed in code, nor for a flow', async () => {
    const owned = { ...base, ownership: 'codeOwnedWasRecorded' as const }
    renderPage(owned, { ownership: 'codeOwnedWasRecorded' })
    await openMore(owned)
    expect(screen.queryByRole('menuitem', { name: /save as flow/i })).toBeNull()
  })

  it('a flow has no Save as flow and no tags field', async () => {
    const flow = { ...base, kind: 'flow' as const, file: 'flows/book_room_flow.rb' }
    renderPage(flow, { kind: 'flow', file: 'flows/book_room_flow.rb' })
    await openMore(flow)
    expect(screen.queryByRole('menuitem', { name: /save as flow/i })).toBeNull()
    expect(screen.queryByLabelText('Tags')).toBeNull()
    expect(api.flowsReady).not.toHaveBeenCalled()
  })
})

describe('New flow', () => {
  it('names the page New flow and starts a flow draft', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/overview/tests/new', state: { kind: 'flow' } }]}>
        <Routes>
          <Route path="/overview/tests/new" element={<TestPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('New flow')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Test name'), { target: { value: 'Fill hours' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await waitFor(() => expect(useRecorderStore.getState().draftTest?.kind).toBe('flow'))
  })

  it('a plain new test is not a flow', async () => {
    render(
      <MemoryRouter initialEntries={['/overview/tests/new']}>
        <Routes>
          <Route path="/overview/tests/new" element={<TestPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('New test')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Test name'), { target: { value: 'Login' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await waitFor(() => expect(useRecorderStore.getState().draftTest).not.toBeNull())
    expect(useRecorderStore.getState().draftTest?.kind).toBeUndefined()
  })
})

describe('Flow inputs', () => {
  const typing: Test['steps'][number] = {
    id: 'h',
    kind: 'type',
    element: { strategy: 'id', value: 'hours', label: 'Hours' },
    text: '8'
  }
  const flow: Test = {
    ...base,
    kind: 'flow',
    file: 'flows/book_room_flow.rb',
    steps: [nav('a'), typing]
  }
  const flowRow = { kind: 'flow' as const, file: 'flows/book_room_flow.rb' }

  it('names a typing step as an input and autosaves it through save-recording', async () => {
    renderPage(flow, flowRow)
    fireEvent.click(await screen.findByRole('button', { name: 'Use as input…' }))
    expect(screen.getByText('Runs use this value unless you give another.')).toBeInTheDocument()
    const field = screen.getByLabelText('Input name')
    fireEvent.change(field, { target: { value: 'Hours' } })
    expect(
      screen.getByText('Use up to 40 lowercase letters, digits or _, starting with a letter.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(field, { target: { value: 'hours' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Type "8" into "Hours" as input hours')).toBeInTheDocument()
    await waitFor(
      () =>
        expect(api.saveRecording).toHaveBeenCalledWith(
          '/p',
          expect.objectContaining({
            id: 't1',
            steps: [nav('a'), { ...typing, inputName: 'hours' }]
          })
        ),
      { timeout: 2000 }
    )
  })

  it('is not offered on a test', async () => {
    renderPage({ ...base, steps: [nav('a'), typing] })
    await screen.findByText('Type "8" into "Hours"')
    expect(screen.queryByRole('button', { name: 'Use as input…' })).toBeNull()
  })

  it('is not offered on a code-owned flow', async () => {
    renderPage(
      { ...flow, ownership: 'codeOwnedWasRecorded' },
      { ...flowRow, ownership: 'codeOwnedWasRecorded' }
    )
    await screen.findByText('Type "8" into "Hours"')
    expect(screen.queryByRole('button', { name: 'Use as input…' })).toBeNull()
  })
})
