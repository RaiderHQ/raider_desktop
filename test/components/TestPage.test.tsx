import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TestPage from '@components/TestPage'
import TestsWorkspace from '@components/TestsWorkspace'
import { testKeyOf, toRouteParam } from '@foundation/testKey'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
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
  continueRecording: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../src/renderer/src/hooks/useTestRecording', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/renderer/src/hooks/useTestRecording')>()
  return {
    useTestRecording: (): ReturnType<typeof actual.useTestRecording> => ({
      ...actual.useTestRecording(),
      start: spies.start,
      continueRecording: spies.continueRecording
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

const listeners = new Map<string, (event: IpcRendererEvent, ...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.({} as IpcRendererEvent, ...args)
  })
}

const api = {
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  saveRecording: vi.fn(),
  deleteTest: vi.fn(),
  exportTest: vi.fn(),
  stopRecordingMain: vi.fn(),
  saveTrace: vi.fn(),
  renderStep: vi.fn(),
  cancelReplay: vi.fn(),
  setRecordingState: vi.fn(),
  onFlushRecording: vi.fn(() => (): void => {}),
  flushRecordingDone: vi.fn()
}

const page = (test: Test): ReactElement => (
  <MemoryRouter
    initialEntries={['/overview/tests/x']}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <Routes>
      <Route path="/overview/tests/:testKey" element={<TestPage row={row(test)} />} />
      <Route path="/overview/tests" element={<div>tests list route</div>} />
    </Routes>
  </MemoryRouter>
)

const renderPage = (test: Test = recorded): ReturnType<typeof render> => render(page(test))

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
  listeners.clear()
  // @ts-expect-error - Mocking window.api
  window.api = api
  window.electron = {
    ipcRenderer: {
      on: (channel: string, cb: (event: IpcRendererEvent, ...args: unknown[]) => unknown) => {
        listeners.set(channel, cb)
        return (): boolean => listeners.delete(channel)
      }
    }
  } as unknown as typeof window.electron
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({ showCode: false, isOutputVisible: false })
  useRunOutputStore.setState({ runOutput: '' })
})

afterEach(() => vi.useRealTimers())

describe('TestPage', () => {
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

  it('has Record, Run, Code, Last run and More', async () => {
    renderPage()
    await opened()
    for (const label of [
      'testPage.record',
      'testPage.run',
      'testPage.code',
      'testPage.lastRun',
      'testPage.more'
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
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

  it('shows the steps through CommandList, and Code shows them as code', async () => {
    renderPage()
    await opened()
    const code = screen.getByRole('button', { name: 'testPage.code' })
    expect(code).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(code)
    expect(code).toHaveAttribute('aria-pressed', 'true')
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
      code: 'Code',
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
    api.saveRecording.mockClear()
    api.stopRecordingMain.mockClear()

    unmount()

    expect(api.stopRecordingMain).toHaveBeenCalled()
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
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
    api.saveRecording.mockClear()

    rerender(page(empty))
    await opened('Empty one')

    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(api.saveRecording).toHaveBeenCalledTimes(1)
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
      <MemoryRouter
        initialEntries={[`/overview/tests/${toRouteParam(key)}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
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

  it('shows a placeholder for a test that is code', async () => {
    renderWorkspace('file:spec/api_spec.rb')
    expect(await screen.findByText('testPage.codePlaceholder')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'testPage.record' })).not.toBeInTheDocument()
  })
})
