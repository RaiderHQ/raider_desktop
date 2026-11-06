import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ipcSubscriptions } from '../helpers/ipcSubscriptions'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TestPage from '@components/TestPage'
import TestsWorkspace from '@components/TestsWorkspace'
import { testKeyOf, toRouteParam } from '@foundation/testKey'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { dispatchMenuCommand } from '@foundation/menuCommands'
import useTitleStore from '@foundation/Stores/titleStore'
import type { RunView } from '@foundation/run/runModel'
import useProjectStore from '@foundation/Stores/projectStore'
import type { TestRow } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'
import en from '@assets/translations/en.json'

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

// The real hook (autosave, suite sync), with the recording entry points observed
const spies = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  continueRecording: vi.fn().mockResolvedValue(undefined),
  recordFromHere: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  rePick: vi.fn()
}))
vi.mock('../../src/renderer/src/hooks/useTestRecording', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/renderer/src/hooks/useTestRecording')>()
  return {
    ...actual,
    useTestRecording: (): ReturnType<typeof actual.useTestRecording> => ({
      ...actual.useTestRecording(),
      start: spies.start,
      continueRecording: spies.continueRecording,
      recordFromHere: spies.recordFromHere,
      run: spies.run,
      rePick: spies.rePick
    })
  }
})

const step = (id: string): Test['steps'][number] => ({
  id,
  kind: 'navigate',
  url: `https://x.test/${id}`
})

const recorded: Test = {
  id: 't1',
  name: 'Login works',
  url: 'https://x.test/login',
  steps: [step('a'), step('b')],
  ownership: 'recorded'
}
const empty: Test = { id: 't2', name: 'Empty one', url: '', steps: [] }

const suites = [{ id: 's1', name: 'Smoke', tests: [recorded, empty] }]

const row = (test: Test): TestRow => ({
  name: test.name,
  testId: test.id,
  ownership: 'recorded',
  suiteIds: ['s1']
})

const listeners = new Map<string, (...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.(...args)
  })
}

const api = {
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  openCodeTest: vi.fn(),
  saveRecording: vi.fn(),
  deleteTest: vi.fn(),
  exportTest: vi.fn(),
  stopRecordingMain: vi.fn(),
  saveTrace: vi.fn(),
  renderStep: vi.fn(),
  cancelReplay: vi.fn(),
  setRecordingState: vi.fn(),
  onFlushRecording: vi.fn(() => (): void => {}),
  flushRecordingDone: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue({ success: false }),
  readImage: vi.fn().mockResolvedValue({ success: false }),
  mapFailedStep: vi.fn().mockResolvedValue({ none: 'noMap' }),
  loadTrace: vi.fn().mockResolvedValue({ success: true, trace: [] })
}

const page = (test: Test): ReactElement => (
  <MemoryRouter initialEntries={['/overview/tests/x']}>
    <Routes>
      <Route path="/overview/tests/:testKey" element={<TestPage row={row(test)} />} />
      <Route path="/overview/tests" element={<div>tests list route</div>} />
    </Routes>
  </MemoryRouter>
)

const renderPage = (test: Test = recorded): ReturnType<typeof render> => render(page(test))

const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }

/** Puts the open test in recording the way start() and main do. */
const startRecording = async (): Promise<void> => {
  act(() => {
    useRecorderStore.getState().setRecordingTarget({ kind: 'test' })
    useRecorderStore.getState().setRecordingBrowser({ url: 'https://x.test', preloadPath: '/p.js' })
    // Continue recording: the steps so far are kept
    useRecorderStore.getState().setBreakpointIndex(1)
  })
  await emit('recording-started', 'https://x.test/login')
}

const opened = async (name = 'Login works'): Promise<void> => {
  await screen.findByDisplayValue(name)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getSuites.mockResolvedValue(suites)
  api.listProjectTests.mockResolvedValue([
    { name: 'API health', file: 'spec/api_spec.rb', ownership: 'code' }
  ])
  api.saveRecording.mockResolvedValue({ success: true })
  api.deleteTest.mockResolvedValue(undefined)
  api.exportTest.mockResolvedValue({ success: true, path: '/out' })
  api.renderStep.mockImplementation(async (s: { url?: string }) => `goto ${s.url ?? ''}`)
  api.saveTrace.mockResolvedValue({ success: true })
  api.readDirectory.mockResolvedValue([])
  api.readFile.mockResolvedValue({ success: false })
  api.readImage.mockResolvedValue({ success: false })
  api.mapFailedStep.mockResolvedValue({ none: 'noMap' })
  api.loadTrace.mockResolvedValue({ success: true, trace: [] })
  listeners.clear()
  // @ts-expect-error - Mocking window.api
  window.api = api
  Object.assign(window.api, ipcSubscriptions(listeners))
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({ showCode: false, isOutputVisible: false })
  useRunOutputStore.setState({ runOutput: '' })
  useRunStore.setState({ run: null, origin: null, isActive: false, notReady: null })
  useProjectStore.setState({ layout: null })
})

afterEach(() => vi.useRealTimers())

describe('TestPage leaving a new test', () => {
  const renderDraft = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter initialEntries={['/overview/tests/new']}>
        <Routes>
          <Route path="/overview/tests/new" element={<TestPage />} />
          <Route path="/overview/tests" element={<div>tests list route</div>} />
        </Routes>
      </MemoryRouter>
    )

  it('forgets a draft nothing was recorded in', async () => {
    useRecorderStore.getState().startDraft('Quick', 'https://x.test')
    renderDraft()
    await screen.findByDisplayValue('Quick')
    expect(useRecorderStore.getState().draftTest).not.toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'testPage.breadcrumbRoot' }))
    await waitFor(() => expect(useRecorderStore.getState().draftTest).toBeNull())
    expect(useRecorderStore.getState().activeTest).toBeNull()
  })

  it('asks for a draft to be saved before it can run', async () => {
    useRecorderStore.getState().startDraft('Quick', 'https://x.test')
    renderDraft()
    await screen.findByDisplayValue('Quick')
    const run = screen.getByRole('button', { name: 'testPage.run' })
    expect(run).toBeDisabled()
    expect(run).toHaveAttribute('title', 'run.saveToRun')
  })

  it('keeps a draft that has recorded steps', async () => {
    useRecorderStore.getState().startDraft('Quick', 'https://x.test')
    act(() =>
      useRecorderStore
        .getState()
        .updateActiveTest((p) =>
          p ? { ...p, steps: [step('a'), { id: 'c', kind: 'custom', code: 'x' }] } : null
        )
    )
    renderDraft()
    await screen.findByDisplayValue('Quick')
    fireEvent.click(screen.getByRole('link', { name: 'testPage.breadcrumbRoot' }))
    await screen.findByText('tests list route')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(useRecorderStore.getState().draftTest).not.toBeNull()
  })
})

const mobileLayout = {
  framework: 'rspec',
  automation: 'appium',
  mobilePlatform: 'ios',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  waitHelper: false,
  recordable: false,
  unsupportedReason: 'mobile'
} as const

describe('TestPage', () => {
  it('says why Record is off in a mobile project', async () => {
    useProjectStore.setState({ layout: mobileLayout })
    renderPage()
    await opened()
    const record = screen.getByRole('button', { name: 'testPage.record' })
    expect(record).toBeDisabled()
    expect(record).toHaveAttribute('title', 'recorder.unsupported.mobile')
    expect(en.recorder.unsupported.mobile).toBe("Mobile projects can't be recorded yet.")
  })

  it('shows a tooltip on focus for Record, with its shortcut', async () => {
    renderPage()
    await opened()
    fireEvent.focus(screen.getByRole('button', { name: 'testPage.record' }))
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('tooltips.testPage.record')
    expect(tip.querySelector('kbd')).not.toBeNull()
  })

  it('keeps Record without a reason for other projects that cannot record', async () => {
    useProjectStore.setState({
      layout: { ...mobileLayout, automation: 'selenium', unsupportedReason: 'minitest' }
    })
    renderPage()
    await opened()
    const record = screen.getByRole('button', { name: 'testPage.record' })
    expect(record).toBeDisabled()
    expect(record).not.toHaveAttribute('title')
  })

  it('says why a new test cannot be recorded in a mobile project', () => {
    useProjectStore.setState({ layout: mobileLayout })
    render(
      <MemoryRouter initialEntries={['/overview/tests/new']}>
        <Routes>
          <Route path="/overview/tests/new" element={<TestPage />} />
        </Routes>
      </MemoryRouter>
    )
    const start = screen.getByRole('button', { name: 'tests.startRecording' })
    expect(start).toBeDisabled()
    expect(start).toHaveAttribute('title', 'recorder.unsupported.mobile')
    expect(screen.getByText('recorder.unsupported.mobile')).toBeInTheDocument()
  })

  it('shows why a mobile run did not start, from this page', async () => {
    // Opening the project first: a switch clears why a run didn't start
    useProjectStore.setState({ projectPath: '/p' })
    useRunStore.setState({
      notReady: {
        reason: 'app',
        detail: '',
        scope: { kind: 'files', files: ['spec/login_spec.rb'] },
        origin: { route: '/overview/tests/x', label: 'Login' },
        projectPath: '/p'
      }
    })
    renderPage()
    await opened()
    expect(
      screen.getByRole('button', { name: 'run.mobile.openDeviceSettings' })
    ).toBeInTheDocument()
  })

  it('shows a breadcrumb back to the Tests list, then the test name', async () => {
    renderPage()
    await opened()
    const nav = screen.getByRole('navigation')
    const link = screen.getByRole('link', { name: 'testPage.breadcrumbRoot' })
    expect(link).toHaveAttribute('href', '/overview/tests')
    expect(nav).toHaveTextContent('Login works')
    fireEvent.click(link)
    expect(screen.getByText('tests list route')).toBeInTheDocument()
  })

  it('opens the row as the active test', async () => {
    renderPage()
    await opened()
    const s = useRecorderStore.getState()
    expect(s.activeSuiteId).toBe('s1')
    expect(s.activeTest?.id).toBe('t1')
    expect(s.readOnlyView).toBeNull()
  })

  it('binds the URL to the active test and autosaves 500 ms after an edit', async () => {
    renderPage()
    await opened()
    vi.useFakeTimers()
    api.saveRecording.mockClear()
    fireEvent.change(screen.getByLabelText('testPage.url'), {
      target: { value: 'https://x.test/new' }
    })
    expect(useRecorderStore.getState().activeTest?.url).toBe('https://x.test/new')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499)
    })
    expect(api.saveRecording).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', url: 'https://x.test/new' })
    )
  })

  it('binds the name to the active test and saves it on blur', async () => {
    renderPage()
    await opened()
    vi.useFakeTimers()
    api.saveRecording.mockClear()
    const name = screen.getByLabelText('testPage.name')
    fireEvent.change(name, { target: { value: 'Login still works' } })
    // A half-typed name never reaches the active test
    expect(useRecorderStore.getState().activeTest?.name).toBe('Login works')
    fireEvent.blur(name)
    expect(useRecorderStore.getState().activeTest?.name).toBe('Login still works')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', name: 'Login still works' })
    )
  })

  it('never autosaves a test edited in code', async () => {
    api.getSuites.mockResolvedValue([
      { id: 's1', name: 'Smoke', tests: [{ ...recorded, ownership: 'codeOwnedWasRecorded' }] }
    ])
    renderPage()
    await opened()
    vi.useFakeTimers()
    api.saveRecording.mockClear()
    act(() =>
      useRecorderStore.getState().updateActiveTest((p) => (p ? { ...p, url: 'changed' } : p))
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(api.saveRecording).not.toHaveBeenCalled()
  })

  it('has Record, Run, Steps | Ruby and More', async () => {
    renderPage()
    await opened()
    for (const label of [
      'testPage.record',
      'testPage.run',
      'testPage.steps',
      'testPage.ruby',
      'testPage.more'
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'testPage.run' })).not.toHaveAttribute('title')
  })

  it('offers Last run only when there is output from an earlier run to show', async () => {
    renderPage()
    await opened()
    expect(screen.queryByRole('button', { name: 'testPage.lastRun' })).not.toBeInTheDocument()
    act(() => useRunOutputStore.setState({ runOutput: 'Running test: Login works...' }))
    expect(screen.getByRole('button', { name: 'testPage.lastRun' })).toBeInTheDocument()
  })

  describe('the live run', () => {
    const run: RunView = {
      runId: 'r1',
      projectPath: '/p',
      scope: { kind: 'files', files: ['spec/login_works_spec.rb'] },
      framework: 'rspec',
      workers: 1,
      liveEvents: true,
      startedAt: new Date().toISOString(),
      phase: 'running',
      tests: {},
      order: [],
      output: [],
      outputSize: 0,
      outputTrimmed: false,
      finished: null
    }

    it('shows the run panel for a run started from this page', async () => {
      useRunStore.setState({
        run,
        origin: { route: '/overview/tests/x', label: 'Login works' },
        isActive: true
      })
      renderPage()
      await opened()
      expect(screen.getByTestId('run-panel')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'testPage.run' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'run.rerunFailed' })).not.toBeInTheDocument()
    })

    it('shows no run panel for a run started elsewhere', async () => {
      useRunStore.setState({
        run,
        origin: { route: '/overview', label: 'This project' },
        isActive: true
      })
      renderPage()
      await opened()
      expect(screen.queryByTestId('run-panel')).not.toBeInTheDocument()
    })
  })

  describe('Edit code', () => {
    const withFile: Test = { ...recorded, file: 'spec/login_works_spec.rb' }
    const EditorProbe = (): JSX.Element => (
      <div data-testid="editor-state">{JSON.stringify(useLocation().state)}</div>
    )
    const renderWithEditor = (test: Test): void => {
      api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [test, empty] }])
      render(
        <MemoryRouter initialEntries={['/overview/tests/x']}>
          <Routes>
            <Route path="/overview/tests/:testKey" element={<TestPage row={row(test)} />} />
            <Route path="/file-editor" element={<EditorProbe />} />
          </Routes>
        </MemoryRouter>
      )
    }
    beforeEach(() => useProjectStore.setState({ projectPath: '/Users/me/project' }))
    afterEach(() => useProjectStore.setState({ projectPath: null }))

    it('opens the test file in the file editor, coming back to this test', async () => {
      renderWithEditor(withFile)
      await opened()
      fireEvent.click(screen.getByRole('button', { name: 'testPage.editCode' }))
      const state = JSON.parse((await screen.findByTestId('editor-state')).textContent ?? '')
      expect(state).toEqual({
        fileName: 'login_works_spec.rb',
        filePath: '/Users/me/project/spec/login_works_spec.rb',
        returnTo: '/overview/tests/x'
      })
    })

    it('is disabled while recording', async () => {
      renderWithEditor(withFile)
      await opened()
      await startRecording()
      expect(screen.getByRole('button', { name: 'testPage.editCode' })).toBeDisabled()
    })

    it('is not offered for a test with no file', async () => {
      renderWithEditor(recorded)
      await opened()
      expect(screen.queryByRole('button', { name: 'testPage.editCode' })).not.toBeInTheDocument()
    })
  })

  it('keeps the test open when its project moves (Save project to…)', async () => {
    useProjectStore.setState({ projectPath: '/quick/shop_test' })
    renderPage()
    await opened()
    act(() => useProjectStore.getState().setProjectPath('/Users/me/shop_test'))
    await opened()
    expect(useRecorderStore.getState().activeTest?.id).toBe('t1')
    useProjectStore.setState({ projectPath: null })
  })

  it('has no wait inputs and no Recording or Dashboard tabs', async () => {
    renderPage()
    await opened()
    expect(screen.queryByText('settings.recording.implicitWait.label')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.recording.explicitWait.label')).not.toBeInTheDocument()
    expect(screen.queryByText('recorder.tabs.recording')).not.toBeInTheDocument()
    expect(screen.queryByText('recorder.tabs.dashboard')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('Record continues a test that has steps', async () => {
    renderPage()
    await opened()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.record' }))
    expect(spies.continueRecording).toHaveBeenCalledWith({ kind: 'test' })
    expect(spies.start).not.toHaveBeenCalled()
  })

  it('Record starts a test that has no steps', async () => {
    renderPage(empty)
    await opened('Empty one')
    fireEvent.click(screen.getByRole('button', { name: 'testPage.record' }))
    expect(spies.start).toHaveBeenCalledWith({ kind: 'test' })
    expect(spies.continueRecording).not.toHaveBeenCalled()
  })

  it('Start over under More asks first, then starts', async () => {
    renderPage()
    await opened()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'testPage.startOver' }))
    expect(spies.start).not.toHaveBeenCalled()
    expect(screen.getByText('testPage.startOverConfirm')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(spies.start).toHaveBeenCalledWith({ kind: 'test' })
    expect(spies.continueRecording).not.toHaveBeenCalled()
  })

  it('Start over can be cancelled', async () => {
    renderPage()
    await opened()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'testPage.startOver' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(spies.start).not.toHaveBeenCalled()
    expect(screen.queryByText('testPage.startOverConfirm')).not.toBeInTheDocument()
  })

  it('Export test under More exports the steps', async () => {
    renderPage()
    await opened()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'testPage.exportTest' }))
    await waitFor(() => expect(api.exportTest).toHaveBeenCalledWith('Login works', recorded.steps))
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled())
  })

  it('Delete test under More confirms with DeleteModal, deletes and returns to the list', async () => {
    renderPage()
    await opened()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'testPage.deleteTest' }))
    expect(api.deleteTest).not.toHaveBeenCalled()
    expect(screen.getByText('recorder.deleteModal.title')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'recorder.deleteModal.delete' }))
    expect(api.deleteTest).toHaveBeenCalledWith('s1', 't1')
    expect(await screen.findByText('tests list route')).toBeInTheDocument()
  })

  it('Last run toggles the output of the last run', async () => {
    useRunOutputStore.setState({ runOutput: 'Running test: Login works...' })
    renderPage()
    await opened()
    expect(screen.queryByText('Running test: Login works...')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.lastRun' }))
    expect(screen.getByText('Running test: Login works...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'testPage.lastRun' }))
    expect(screen.queryByText('Running test: Login works...')).not.toBeInTheDocument()
  })

  it('shows the steps through CommandList, and Ruby shows them as code', async () => {
    renderPage()
    await opened()
    const ruby = screen.getByRole('button', { name: 'testPage.ruby' })
    const steps = screen.getByRole('button', { name: 'testPage.steps' })
    expect(ruby).toHaveAttribute('aria-pressed', 'false')
    expect(steps).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(ruby)
    expect(ruby).toHaveAttribute('aria-pressed', 'true')
    expect(steps).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText('goto https://x.test/a')).toBeInTheDocument()
    expect(screen.getByText('goto https://x.test/b')).toBeInTheDocument()
  })

  it('says so when the test cannot be opened', async () => {
    api.getSuites.mockResolvedValue([])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    expect(await screen.findByText('tests.actionFailed')).toBeInTheDocument()
    error.mockRestore()
  })

  it('uses the fixed copy', () => {
    expect(en.testPage).toMatchObject({
      breadcrumbRoot: 'Tests',
      record: 'Record',
      run: 'Run',
      steps: 'Steps',
      ruby: 'Ruby',
      view: 'View',
      stepsUnavailable: "Steps aren't available: Raider couldn't read every line of this test.",
      editCode: 'Open file…',
      lastRun: 'Last run',
      more: 'More',
      stop: 'Stop & save',
      recording: 'Recording',
      startOver: 'Start over',
      exportTest: 'Export test',
      deleteTest: 'Delete test'
    })
    expect(en.tests).toMatchObject({
      rail: 'Tests',
      saved: 'Saved to your project as {{name}} ({{file}})'
    })
  })

  it('leaving the page while recording stops and saves the recording', async () => {
    const { unmount } = renderPage()
    await opened()
    await startRecording()
    await emit('new-recorded-step', step('n'))
    await emit('new-trace-step', traceStep)
    api.saveRecording.mockClear()
    api.stopRecordingMain.mockClear()

    unmount()

    expect(api.stopRecordingMain).toHaveBeenCalled()
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
    // Nothing listens for main's 'recording-stopped' any more: the leave saved the trace,
    // once the test itself was saved
    await waitFor(() => expect(api.saveTrace).toHaveBeenCalledTimes(1))
    expect(api.saveTrace).toHaveBeenCalledWith('t1', [traceStep], expect.any(Array))
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', steps: [step('a'), step('b'), step('n')] })
    )
    expect(api.setRecordingState).toHaveBeenLastCalledWith(false)
  })

  it('opening another test while recording saves the first, and later steps never reach the second', async () => {
    const { rerender } = renderPage(recorded)
    await opened()
    await startRecording()
    await emit('new-recorded-step', step('n'))
    await emit('new-trace-step', traceStep)
    api.saveRecording.mockClear()

    rerender(page(empty))
    await opened('Empty one')
    // Main's 'recording-stopped' arrives once the second test is open
    await emit('recording-stopped')

    expect(api.stopRecordingMain).toHaveBeenCalled()
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
    expect(api.saveTrace).toHaveBeenCalledTimes(1)
    expect(api.saveTrace).toHaveBeenCalledWith('t1', [traceStep], expect.any(Array))
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', steps: [step('a'), step('b'), step('n')] })
    )
    expect(useRecorderStore.getState().activeTest?.id).toBe('t2')

    await emit('new-recorded-step', step('late'))
    expect(useRecorderStore.getState().activeTest?.steps).toEqual([])
    expect(useRecorderStore.getState().isRecording).toBe(false)
  })

  it('opening another test while replaying cancels the replay and saves the first', async () => {
    const { rerender } = renderPage(recorded)
    await opened()
    await startRecording()
    // Replaying up to a step in the webview after main started recording
    act(() => useRecorderStore.setState({ isReplayingToBreakpoint: true, breakpointIndex: 1 }))
    api.saveRecording.mockClear()

    rerender(page(empty))
    await opened('Empty one')

    expect(api.cancelReplay).toHaveBeenCalled()
    expect(api.saveRecording).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 't1' }))
    expect(useRecorderStore.getState().isReplayingToBreakpoint).toBe(false)
    expect(useRecorderStore.getState().breakpointIndex).toBeNull()
  })
})

describe('TestsWorkspace pane', () => {
  const renderWorkspace = (key: string): void => {
    render(
      <MemoryRouter initialEntries={[`/overview/tests/${toRouteParam(key)}`]}>
        <Routes>
          <Route path="/overview/tests/:testKey" element={<TestsWorkspace />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('shows the test page for a recorded (here: suite-only) test', async () => {
    renderWorkspace(testKeyOf(row(recorded)))
    expect(await screen.findByDisplayValue('Login works')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.record' })).toBeInTheDocument()
  })

  it('shows the code test pane for a test that is code', async () => {
    api.openCodeTest.mockResolvedValue({
      file: 'spec/api_spec.rb',
      examples: [{ name: 'responds', steps: [] }]
    })
    renderWorkspace('file:spec/api_spec.rb')
    expect(await screen.findByRole('button', { name: 'responds' })).toBeInTheDocument()
    expect(api.openCodeTest).toHaveBeenCalledWith('spec/api_spec.rb')
    expect(screen.getByRole('button', { name: 'testPage.editCode' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('API health')).not.toBeInTheDocument()
  })
})

describe('TestPage after a failed run', () => {
  const withFile: Test = { ...recorded, file: 'spec/login_works_spec.rb' }
  const runJson = (status: string): string =>
    JSON.stringify({
      run: { finished_at: '2026-11-02T10:00:00Z' },
      results: [
        {
          full_name: 'Login works',
          file_path: './spec/login_works_spec.rb',
          status,
          failure: {
            message: 'Unable to locate element',
            exception_class: 'Selenium::WebDriver::Error::NoSuchElementError',
            backtrace: ['spec/login_works_spec.rb:8:in `block`'],
            app_frame: 'spec/login_works_spec.rb:8:in `block`'
          }
        }
      ]
    })
  let status = 'failed'

  beforeEach(() => {
    status = 'failed'
    useProjectStore.setState({ projectPath: '/p' })
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [withFile, empty] }])
    api.readDirectory.mockImplementation(async (dir: string) =>
      dir === '/p/raider-results'
        ? [{ name: 'run.json', type: 'file', path: '/p/raider-results/run.json' }]
        : []
    )
    api.readFile.mockImplementation(async (path: string) =>
      path === '/p/raider-results/run.json'
        ? { success: true, data: runJson(status) }
        : { success: false }
    )
    api.mapFailedStep.mockResolvedValue({ stepId: 'b', index: 1 })
  })
  afterEach(() => useProjectStore.setState({ projectPath: null }))

  it('shows the failed step above the steps and marks it in the list', async () => {
    renderPage(withFile)
    await opened()
    expect(await screen.findByTestId('failed-step-panel')).toBeInTheDocument()
    expect(screen.getByText('failedStep.title')).toBeInTheDocument()
    const failed = screen.getAllByTestId('step-failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toHaveTextContent('recorder.commandParser.visit')
    expect(api.mapFailedStep).toHaveBeenCalledWith('/p', 't1', {
      file: 'spec/login_works_spec.rb',
      backtrace: ['spec/login_works_spec.rb:8:in `block`'],
      appFrame: 'spec/login_works_spec.rb:8:in `block`',
      finishedAt: '2026-11-02T10:00:00Z'
    })
  })

  it('opening the failed test never saves it, so its last run still maps', async () => {
    renderPage(withFile)
    await opened()
    await screen.findByTestId('failed-step-panel')
    // Past the 500 ms autosave
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(screen.getByTestId('failed-step-panel')).toBeInTheDocument()
  })

  it('hides the panel while recording and looks again when it stops', async () => {
    renderPage(withFile)
    await opened()
    await screen.findByTestId('failed-step-panel')
    api.mapFailedStep.mockClear()
    act(() => useRecorderStore.getState().setRecordingTarget({ kind: 'test' }))
    expect(screen.queryByTestId('failed-step-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('step-failed')).not.toBeInTheDocument()
    expect(api.mapFailedStep).not.toHaveBeenCalled()
    act(() => useRecorderStore.getState().setRecordingTarget(null))
    expect(await screen.findByTestId('failed-step-panel')).toBeInTheDocument()
    expect(api.mapFailedStep).toHaveBeenCalledTimes(1)
  })

  it('shows no panel when the last run passed', async () => {
    status = 'passed'
    renderPage(withFile)
    await opened()
    await waitFor(() => expect(api.readFile).toHaveBeenCalled())
    expect(screen.queryByTestId('failed-step-panel')).not.toBeInTheDocument()
    expect(api.mapFailedStep).not.toHaveBeenCalled()
  })

  it('looks again when a run of this project finishes', async () => {
    renderPage(withFile)
    await opened()
    await screen.findByTestId('failed-step-panel')
    status = 'passed'
    act(() =>
      useRunStore.setState({
        run: {
          projectPath: '/p',
          scope: { kind: 'files', files: ['spec/login_works_spec.rb'] },
          order: [],
          tests: {},
          finished: { finishedAt: '2026-11-02T11:00:00Z' }
        } as unknown as RunView
      })
    )
    await waitFor(() => expect(screen.queryByTestId('failed-step-panel')).not.toBeInTheDocument())
    expect(screen.queryByTestId('step-failed')).not.toBeInTheDocument()
  })
})

describe('TestPage fixing a failed value', () => {
  const typed: Test = {
    ...recorded,
    file: 'spec/login_works_spec.rb',
    steps: [
      step('a'),
      { id: 'b', kind: 'type', element: { strategy: 'css', value: '#q' }, text: 'old' }
    ]
  }
  const runJson = JSON.stringify({
    run: { finished_at: '2026-11-02T10:00:00Z' },
    results: [
      {
        full_name: 'Login works',
        file_path: './spec/login_works_spec.rb',
        status: 'failed',
        failure: {
          message: 'boom',
          exception_class: 'RuntimeError',
          backtrace: ['spec/login_works_spec.rb:8:in `block`'],
          app_frame: 'spec/login_works_spec.rb:8:in `block`'
        }
      }
    ]
  })

  beforeEach(() => {
    useProjectStore.setState({ projectPath: '/p' })
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [typed, empty] }])
    api.readDirectory.mockImplementation(async (dir: string) =>
      dir === '/p/raider-results'
        ? [{ name: 'run.json', type: 'file', path: '/p/raider-results/run.json' }]
        : []
    )
    api.readFile.mockImplementation(async (path: string) =>
      path === '/p/raider-results/run.json' ? { success: true, data: runJson } : { success: false }
    )
    api.mapFailedStep.mockResolvedValue({ stepId: 'b', index: 1 })
  })
  afterEach(() => useProjectStore.setState({ projectPath: null }))

  it('saves the new value, then says it is fixed', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    api.saveRecording.mockClear()
    fireEvent.change(screen.getByRole('textbox', { name: 'failedStep.value' }), {
      target: { value: 'new' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    expect(await screen.findByText('failedStep.fixed')).toBeInTheDocument()
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        id: 't1',
        steps: [step('a'), { ...typed.steps[1], text: 'new' }]
      })
    )
    expect(screen.queryByRole('button', { name: 'failedStep.save' })).not.toBeInTheDocument()
  })

  it('saves the new value once: the autosave leaves it alone', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'failedStep.value' }), {
      target: { value: 'new' }
    })
    api.saveRecording.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    expect(await screen.findByText('failedStep.fixed')).toBeInTheDocument()
    // Past the autosave's 500 ms
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })
    expect(api.saveRecording).toHaveBeenCalledTimes(1)
  })

  it('stays unfixed when the save fails', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    api.saveRecording.mockResolvedValue({ success: false, error: 'nope' })
    fireEvent.change(screen.getByRole('textbox', { name: 'failedStep.value' }), {
      target: { value: 'new' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalled())
    expect(screen.queryByText('failedStep.fixed')).not.toBeInTheDocument()
  })

  it('shows Fixed in place of the failure, and Run again runs the test', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'failedStep.value' }), {
      target: { value: 'new' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    expect(await screen.findByRole('heading', { name: 'failedStep.fixed' })).toBeInTheDocument()
    expect(screen.queryByText('failedStep.changedSinceRun')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.runAgain' }))
    expect(spies.run).toHaveBeenCalledTimes(1)
  })

  it('saves the latest steps, not the ones this render started with', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    act(() =>
      useRecorderStore
        .getState()
        .updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, step('z')] } : null))
    )
    api.saveRecording.mockClear()
    fireEvent.change(screen.getByRole('textbox', { name: 'failedStep.value' }), {
      target: { value: 'new' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalled())
    expect(api.saveRecording.mock.calls[0][1].steps).toEqual([
      step('a'),
      { ...typed.steps[1], text: 'new' },
      step('z')
    ])
  })

  it('closes the form without saving when the value is unchanged', async () => {
    renderPage(typed)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.editValue' }))
    api.saveRecording.mockClear()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'failedStep.value' }), { key: 'Enter' })
    expect(screen.queryByRole('textbox', { name: 'failedStep.value' })).not.toBeInTheDocument()
    expect(screen.queryByText('failedStep.fixed')).not.toBeInTheDocument()
    expect(api.saveRecording).not.toHaveBeenCalled()
  })

  it('offers no Edit value for a secret step', async () => {
    const secretTest: Test = {
      ...typed,
      steps: [step('a'), { ...typed.steps[1], text: '', secret: true } as Test['steps'][number]]
    }
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [secretTest, empty] }])
    renderPage(secretTest)
    await opened()
    await screen.findByTestId('failed-step-panel')
    expect(screen.queryByRole('button', { name: 'failedStep.editValue' })).not.toBeInTheDocument()
  })
})

describe('TestPage re-record from the failed step', () => {
  const five: Test = {
    ...recorded,
    file: 'spec/login_works_spec.rb',
    steps: ['a', 'b', 'c', 'd', 'e'].map(step)
  }
  const runJson = JSON.stringify({
    run: { finished_at: '2026-11-02T10:00:00Z' },
    results: [
      {
        full_name: 'Login works',
        file_path: './spec/login_works_spec.rb',
        status: 'failed',
        failure: {
          message: 'boom',
          exception_class: 'RuntimeError',
          backtrace: ['spec/login_works_spec.rb:8:in `block`'],
          app_frame: 'spec/login_works_spec.rb:8:in `block`'
        }
      }
    ]
  })

  beforeEach(() => {
    spies.start.mockClear()
    spies.recordFromHere.mockClear()
    useProjectStore.setState({ projectPath: '/p' })
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [five, empty] }])
    api.readDirectory.mockImplementation(async (dir: string) =>
      dir === '/p/raider-results'
        ? [{ name: 'run.json', type: 'file', path: '/p/raider-results/run.json' }]
        : []
    )
    api.readFile.mockImplementation(async (path: string) =>
      path === '/p/raider-results/run.json' ? { success: true, data: runJson } : { success: false }
    )
    api.mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
  })
  afterEach(() => useProjectStore.setState({ projectPath: null }))

  it('asks first, then keeps the steps before the failed one and records on', async () => {
    renderPage(five)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.reRecord' }))
    expect(screen.getByText('failedStep.reRecordConfirmTitle')).toBeInTheDocument()
    expect(screen.getByText('failedStep.reRecordConfirmBody')).toBeInTheDocument()
    expect(spies.recordFromHere).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(spies.recordFromHere).toHaveBeenCalledWith(1, { kind: 'test' })
    expect(spies.start).not.toHaveBeenCalled()
  })

  it('starts over when the failed step is the first', async () => {
    api.mapFailedStep.mockResolvedValue({ stepId: 'a', index: 0 })
    renderPage(five)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.reRecord' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(spies.start).toHaveBeenCalledWith({ kind: 'test' })
    expect(spies.recordFromHere).not.toHaveBeenCalled()
  })

  it('starts over when the step could not be told', async () => {
    api.mapFailedStep.mockResolvedValue({ none: 'noMap' })
    renderPage(five)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.reRecord' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(spies.start).toHaveBeenCalledWith({ kind: 'test' })
  })

  it('does nothing when cancelled', async () => {
    renderPage(five)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.reRecord' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('failedStep.reRecordConfirmTitle')).not.toBeInTheDocument()
    expect(spies.start).not.toHaveBeenCalled()
    expect(spies.recordFromHere).not.toHaveBeenCalled()
  })
})

describe('TestPage re-picking the failed element', () => {
  const clicks: Test = {
    ...recorded,
    file: 'spec/login_works_spec.rb',
    steps: [
      step('a'),
      { id: 'b', kind: 'click', element: { strategy: 'css', value: '#next' } },
      { id: 'c', kind: 'click', element: { strategy: 'css', value: '#save' } }
    ]
  }
  const runJson = JSON.stringify({
    run: { finished_at: '2026-11-02T10:00:00Z' },
    results: [
      {
        full_name: 'Login works',
        file_path: './spec/login_works_spec.rb',
        status: 'failed',
        failure: {
          message: 'boom',
          exception_class: 'RuntimeError',
          backtrace: ['spec/login_works_spec.rb:8:in `block`'],
          app_frame: 'spec/login_works_spec.rb:8:in `block`'
        }
      }
    ]
  })

  beforeEach(() => {
    spies.rePick.mockReset()
    spies.recordFromHere.mockClear()
    useProjectStore.setState({ projectPath: '/p' })
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [clicks, empty] }])
    api.readDirectory.mockImplementation(async (dir: string) =>
      dir === '/p/raider-results'
        ? [{ name: 'run.json', type: 'file', path: '/p/raider-results/run.json' }]
        : []
    )
    api.readFile.mockImplementation(async (path: string) =>
      path === '/p/raider-results/run.json' ? { success: true, data: runJson } : { success: false }
    )
    api.mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
  })
  afterEach(() => useProjectStore.setState({ projectPath: null }))

  it('shows the banner while picking, in place of the panel', async () => {
    renderPage(clicks)
    await opened()
    await screen.findByTestId('failed-step-panel')
    act(() => {
      useRecorderStore.getState().setRecordingTarget({ kind: 'pick', stepId: 'c' })
      useRecorderStore.getState().setPickingStep(3)
    })
    expect(screen.getByText('failedStep.pickBanner')).toBeInTheDocument()
    expect(screen.queryByTestId('failed-step-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.record' })).toBeDisabled()
  })

  it('says it is getting to the step while the recorder opens, with Cancel', async () => {
    renderPage(clicks)
    await opened()
    await screen.findByTestId('failed-step-panel')
    act(() => useRecorderStore.getState().setRecordingTarget({ kind: 'pick', stepId: 'c' }))
    expect(screen.getByText('failedStep.pickLoading')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(api.cancelReplay).toHaveBeenCalled()
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
    expect(screen.queryByText('failedStep.pickLoading')).not.toBeInTheDocument()
    expect(await screen.findByTestId('failed-step-panel')).toBeInTheDocument()
  })

  it('Cancel beside the banner ends the pick', async () => {
    renderPage(clicks)
    await opened()
    await screen.findByTestId('failed-step-panel')
    act(() => {
      useRecorderStore.getState().setRecordingTarget({ kind: 'pick', stepId: 'c' })
      useRecorderStore.getState().setPickingStep(3)
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
  })

  it('Esc in the app window ends the pick', async () => {
    renderPage(clicks)
    await opened()
    await screen.findByTestId('failed-step-panel')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api.stopRecordingMain).not.toHaveBeenCalled()
    act(() => {
      useRecorderStore.getState().setRecordingTarget({ kind: 'pick', stepId: 'c' })
      useRecorderStore.getState().setPickingStep(3)
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
  })

  it('says it is fixed once the element was picked', async () => {
    let finish: (outcome: { kind: 'picked' }) => void = () => {}
    spies.rePick.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    renderPage(clicks)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.rePick' }))
    expect(spies.rePick).toHaveBeenCalledWith(2)
    // The recorder opens and closes, as rePick does
    act(() => useRecorderStore.getState().setRecordingTarget({ kind: 'pick', stepId: 'c' }))
    await act(async () => {})
    act(() => useRecorderStore.getState().setRecordingTarget(null))
    await act(async () => finish({ kind: 'picked' }))
    expect(await screen.findByText('failedStep.fixed')).toBeInTheDocument()
    // And stays so once the page has looked at the last run again
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.getByText('failedStep.fixed')).toBeInTheDocument()
  })

  it('offers to re-record from the step the replay could not get past', async () => {
    spies.rePick.mockResolvedValue({ kind: 'replayFailed', stepNumber: 2 })
    renderPage(clicks)
    await opened()
    fireEvent.click(await screen.findByRole('button', { name: 'failedStep.rePick' }))
    expect(await screen.findByText('failedStep.replayFailed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.reRecordFrom' }))
    expect(screen.getByText('failedStep.reRecordConfirmTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(spies.recordFromHere).toHaveBeenCalledWith(0, { kind: 'test' })
  })

  describe('menu bar Test › Record and Run (D11)', () => {
    const withFile: Test = { ...recorded, file: 'spec/login_works_spec.rb' }

    it('Run from the menu runs the open test', async () => {
      renderPage(withFile)
      await opened()
      act(() => dispatchMenuCommand('run'))
      expect(spies.run).toHaveBeenCalledTimes(1)
    })

    it('Record from the menu records the open test, like the Record button', async () => {
      renderPage()
      await opened()
      act(() => dispatchMenuCommand('record'))
      expect(spies.continueRecording).toHaveBeenCalledWith({ kind: 'test' })
    })

    it('ignores Run and Record while a confirmation is open', async () => {
      renderPage(withFile)
      await opened()
      fireEvent.click(screen.getByRole('button', { name: 'testPage.more' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'testPage.startOver' }))
      expect(screen.getByText('testPage.startOverConfirm')).toBeInTheDocument()
      act(() => {
        dispatchMenuCommand('run')
        dispatchMenuCommand('record')
      })
      expect(spies.run).not.toHaveBeenCalled()
      expect(spies.continueRecording).not.toHaveBeenCalled()
      expect(spies.start).not.toHaveBeenCalled()
    })

    it('ignores Run and Record while a recording is going', async () => {
      renderPage(withFile)
      await opened()
      await startRecording()
      act(() => {
        dispatchMenuCommand('run')
        dispatchMenuCommand('record')
      })
      expect(spies.run).not.toHaveBeenCalled()
      expect(spies.continueRecording).not.toHaveBeenCalled()
    })
  })

  describe('saving (PR B)', () => {
    it('File › Save stops and saves while recording', async () => {
      renderPage()
      await opened()
      await startRecording()
      act(() => dispatchMenuCommand('save'))
      expect(api.stopRecordingMain).toHaveBeenCalled()
    })

    it('File › Save does nothing on a saved test', async () => {
      renderPage()
      await opened()
      act(() => dispatchMenuCommand('save'))
      expect(api.stopRecordingMain).not.toHaveBeenCalled()
      expect(api.saveRecording).not.toHaveBeenCalled()
    })

    it('the title is edited while recording and clean after Stop & save', async () => {
      renderPage()
      await opened()
      expect(useTitleStore.getState().document).toEqual({ name: 'Login works', edited: false })
      await startRecording()
      expect(useTitleStore.getState().document).toEqual({ name: 'Login works', edited: true })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'testPage.stop' }))
      })
      await emit('recording-stopped')
      await waitFor(() =>
        expect(useTitleStore.getState().document).toEqual({ name: 'Login works', edited: false })
      )
    })

    it('says the test autosaves when it is saved and idle', async () => {
      renderPage()
      await opened()
      expect(screen.getByText('testPage.autosaved')).toBeInTheDocument()
      await startRecording()
      expect(screen.queryByText('testPage.autosaved')).not.toBeInTheDocument()
    })

    it('does not say it for a draft', async () => {
      useRecorderStore.getState().startDraft('New one', 'https://x.test')
      // A draft with steps is kept, whatever an earlier test's deferred cleanup does
      act(() =>
        useRecorderStore
          .getState()
          .updateActiveTest((p) => (p ? { ...p, steps: [step('a'), step('b')] } : null))
      )
      render(
        <MemoryRouter>
          <TestPage />
        </MemoryRouter>
      )
      await screen.findByDisplayValue('New one')
      expect(screen.queryByText('testPage.autosaved')).not.toBeInTheDocument()
    })

    it('has the sentence in en.json', () => {
      expect(en.testPage.autosaved).toBe('Changes to this test are saved automatically.')
    })
  })
})
