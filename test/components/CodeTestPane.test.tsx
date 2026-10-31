import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import CodeTestPane from '@components/CodeTestPane'
import TestsWorkspace from '@components/TestsWorkspace'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunView } from '@foundation/run/runModel'
import { toRouteParam } from '@foundation/testKey'
import type { TestRow } from '@foundation/testKey'
import type { Step } from '@shared/types/step'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import en from '@assets/translations/en.json'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, options?: object) => string } => ({
    t: (key: string, options?: object): string =>
      options ? `${key} ${JSON.stringify(options)}` : key
  })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const navigateStep = (id: string, url: string): Step => ({ id, kind: 'navigate', url })
const clickStep: Step = {
  id: 'rec-click',
  kind: 'click',
  element: { strategy: 'css', value: '#recorded-button' }
}

const view = {
  file: 'spec/login_spec.rb',
  examples: [
    { name: 'logs in', steps: [navigateStep('a', 'https://x.test/first-example')] },
    { name: 'logs out', steps: [navigateStep('b', 'https://x.test/second-example')] }
  ]
}

const codeRow: TestRow = {
  name: 'Login',
  file: 'spec/login_spec.rb',
  ownership: 'code',
  suiteIds: []
}

const listeners = new Map<string, (event: IpcRendererEvent, ...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.({} as IpcRendererEvent, ...args)
  })
}

const api = {
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  openCodeTest: vi.fn(),
  startRun: vi.fn(),
  getRunDefaults: vi.fn(),
  recordOverExample: vi.fn(),
  saveRecording: vi.fn(),
  saveTrace: vi.fn(),
  renderStep: vi.fn(),
  loadUrlRequest: vi.fn(),
  startRecordingMain: vi.fn(),
  stopRecordingMain: vi.fn(),
  registerRecorderWebContents: vi.fn(),
  cancelReplay: vi.fn(),
  setRecordingState: vi.fn(),
  onFlushRecording: vi.fn((_cb: () => void) => (): void => {}),
  flushRecordingDone: vi.fn(),
  setActiveProject: vi.fn(),
  readDirectory: vi.fn()
}

const EditorProbe = (): JSX.Element => (
  <div data-testid="editor-state">{JSON.stringify(useLocation().state)}</div>
)
const LocationProbe = (): JSX.Element => <div data-testid="location">{useLocation().pathname}</div>

const renderPane = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/overview/tests/x']}>
      <Routes>
        <Route path="/overview/tests/:testKey" element={<CodeTestPane row={codeRow} />} />
        <Route path="/file-editor" element={<EditorProbe />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  )

/** Record, confirm the warning, and let main report the recording started with one click */
const recordOverFirstExample = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: 'testPage.record' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(api.startRecordingMain).toHaveBeenCalled())
  await emit('recording-started', 'https://x.test/base')
  act(() =>
    useRecorderStore
      .getState()
      .updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, clickStep] } : p))
  )
}

const stopAndSave = async (): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'testPage.stop' }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  api.getSuites.mockResolvedValue([])
  api.listProjectTests.mockResolvedValue([])
  api.openCodeTest.mockResolvedValue(view)
  api.startRun.mockResolvedValue({ runId: 'r1' })
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 8 })
  useRunStore.setState({ run: null, origin: null, isActive: false })
  api.recordOverExample.mockResolvedValue({ success: true })
  api.saveRecording.mockResolvedValue({
    success: true,
    test: { name: 'logs in', file: 'spec/logs_in_spec.rb' }
  })
  api.saveTrace.mockResolvedValue({ success: true })
  api.renderStep.mockImplementation(async (s: { url?: string; code?: string }) =>
    s.code !== undefined ? s.code : `goto ${s.url ?? ''}`
  )
  api.loadUrlRequest.mockResolvedValue({ success: true })
  api.setActiveProject.mockResolvedValue({ success: true })
  api.readDirectory.mockResolvedValue([])
  api.startRecordingMain.mockResolvedValue({
    success: true,
    url: 'https://x.test/base',
    preloadPath: '/preload.js'
  })
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
  useProjectStore.setState({ projectPath: '/Users/me/project', layout: null })
  useRubyStore.setState({ rubyCommand: 'ruby' })
})

describe('CodeTestPane', () => {
  it('lists the examples and selects the first one', async () => {
    renderPane()
    const first = await screen.findByRole('button', { name: 'logs in' })
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'logs out' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(api.openCodeTest).toHaveBeenCalledWith('spec/login_spec.rb')
    expect(await screen.findByText(/first-example/)).toBeInTheDocument()
    expect(screen.queryByText(/second-example/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'logs out' }))
    expect(await screen.findByText(/second-example/)).toBeInTheDocument()
  })

  it('has no old read-only banner, custom code heading or way back to the recorder', async () => {
    renderPane()
    await screen.findByRole('button', { name: 'logs in' })
    expect(screen.queryByText(/Edited in code by a developer/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Custom code step/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to the recorder/ })).not.toBeInTheDocument()
  })

  it('opens a test with code Raider has no step for as its code, with no steps view', async () => {
    api.openCodeTest.mockResolvedValue({
      file: 'spec/login_spec.rb',
      examples: [
        {
          name: 'logs in',
          steps: [
            navigateStep('a', 'https://x.test/login'),
            { id: 'c', kind: 'custom', code: 'expect(page.title).to eq("Home")' }
          ]
        }
      ]
    })
    renderPane()
    expect(await screen.findByText('expect(page.title).to eq("Home")')).toBeInTheDocument()
    expect(screen.queryByText('recorder.step.custom')).not.toBeInTheDocument()
    const code = screen.getByRole('button', { name: 'testPage.code' })
    expect(code).toHaveAttribute('aria-pressed', 'true')
    expect(code).toBeDisabled()
  })

  it('opens as code even when the steps view was on elsewhere, and offers steps when they match', async () => {
    useRecorderStore.setState({ showCode: false })
    renderPane()
    expect(await screen.findByText('goto https://x.test/first-example')).toBeInTheDocument()
    const code = screen.getByRole('button', { name: 'testPage.code' })
    expect(code).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(code)
    expect(code).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText(/commandParser\.visit/)).toBeInTheDocument()
    expect(screen.queryByText('goto https://x.test/first-example')).not.toBeInTheDocument()
  })

  it('Run runs the file live, from this page', async () => {
    renderPane()
    await screen.findByRole('button', { name: 'logs in' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'testPage.run' }))
    })
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(api.startRun.mock.calls[0][0].scope).toEqual({
      kind: 'files',
      files: ['spec/login_spec.rb']
    })
    expect(useRunStore.getState().origin).toEqual({ route: '/overview/tests/x', label: 'Login' })
  })

  it('shows the run panel for its own run, and Run is off while a run is going', async () => {
    const run: RunView = {
      runId: 'r1',
      projectPath: '/Users/me/project',
      scope: { kind: 'files', files: ['spec/login_spec.rb'] },
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
    useRunStore.setState({
      run,
      origin: { route: '/overview/tests/x', label: 'Login' },
      isActive: true
    })
    renderPane()
    await screen.findByRole('button', { name: 'logs in' })
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.run' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'run.rerunFailed' })).not.toBeInTheDocument()
  })

  it('Edit code opens the file editor with the exact state', async () => {
    renderPane()
    fireEvent.click(await screen.findByRole('button', { name: 'testPage.editCode' }))
    const state = JSON.parse((await screen.findByTestId('editor-state')).textContent ?? '')
    expect(state).toEqual({
      fileName: 'login_spec.rb',
      filePath: '/Users/me/project/spec/login_spec.rb',
      returnTo: '/overview/tests/x'
    })
  })

  it('Record warns first; cancelling starts nothing', async () => {
    renderPane()
    fireEvent.click(await screen.findByRole('button', { name: 'testPage.record' }))
    expect(screen.getByText('testPage.overwriteConfirm')).toBeInTheDocument()
    // Names the test and the file it will change
    expect(
      screen.getByText(
        `testPage.overwriteTarget ${JSON.stringify({ name: 'logs in', file: 'spec/login_spec.rb' })}`
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('testPage.overwriteConfirm')).not.toBeInTheDocument()
    expect(api.startRecordingMain).not.toHaveBeenCalled()
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
  })

  it('recording over an example saves it into the file and reloads the view', async () => {
    renderPane()
    await recordOverFirstExample()
    expect(useRecorderStore.getState().recordingTarget).toEqual({
      kind: 'example',
      file: 'spec/login_spec.rb',
      exampleName: 'logs in'
    })
    // The recording layout: the steps beside the embedded browser
    expect(await screen.findByText(/recorded-button/)).toBeInTheDocument()
    api.openCodeTest.mockClear()
    await stopAndSave()

    expect(api.recordOverExample).toHaveBeenCalledWith(
      'spec/login_spec.rb',
      'logs in',
      [expect.objectContaining({ kind: 'navigate' }), clickStep],
      'ruby'
    )
    expect(mockToast.success).toHaveBeenCalledWith(
      `tests.saved ${JSON.stringify({ name: 'logs in', file: 'spec/login_spec.rb' })}`
    )
    await waitFor(() => expect(api.openCodeTest).toHaveBeenCalledWith('spec/login_spec.rb'))
    expect(api.saveRecording).not.toHaveBeenCalled()
  })

  it('records the selected example', async () => {
    renderPane()
    fireEvent.click(await screen.findByRole('button', { name: 'logs out' }))
    await recordOverFirstExample()
    await stopAndSave()
    expect(api.recordOverExample).toHaveBeenCalledWith(
      'spec/login_spec.rb',
      'logs out',
      expect.any(Array),
      'ruby'
    )
  })

  it('when the example is not unique, says so and offers Save as a new test', async () => {
    api.recordOverExample.mockResolvedValue({ success: false, error: 'notUnique', count: 0 })
    renderPane()
    await recordOverFirstExample()
    await stopAndSave()

    expect(
      await screen.findByText(`testPage.exampleNotUnique ${JSON.stringify({ name: 'logs in' })}`)
    ).toBeInTheDocument()
    expect(screen.getByText(/recorded-button/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'testPage.saveAsNew' }))
    })
    expect(api.saveRecording).toHaveBeenCalledWith(
      UNLISTED_SUITE_ID,
      expect.objectContaining({ name: 'logs in', steps: expect.arrayContaining([clickStep]) })
    )
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('tests.saved'))
    // Opens the new test
    const recordedId = useRecorderStore.getState().activeTest?.id ?? ''
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/overview/tests/${toRouteParam(`id:${recordedId}`)}`
      )
    )
    expect(useRecorderStore.getState().unsavedExample).toBeNull()
  })

  it('when Ruby is missing, the error is shown and the steps stay, with Save as a new test', async () => {
    api.recordOverExample.mockResolvedValue({ success: false, error: 'Ruby missing' })
    renderPane()
    await recordOverFirstExample()
    await stopAndSave()

    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Ruby missing'))
    expect(screen.getByText(/recorded-button/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.saveAsNew' })).toBeInTheDocument()
    expect(api.saveRecording).not.toHaveBeenCalled()
    // Recording again would drop the unsaved steps
    expect(screen.getByRole('button', { name: 'testPage.record' })).toBeDisabled()
  })

  it('a recording that throws on save keeps the steps too', async () => {
    api.recordOverExample.mockRejectedValue(new Error('IPC gone'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPane()
    await recordOverFirstExample()
    await stopAndSave()

    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('IPC gone'))
    expect(screen.getByText(/recorded-button/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.saveAsNew' })).toBeInTheDocument()
    error.mockRestore()
  })

  it('leaving mid-recording when the file cannot take it saves the steps as a new test', async () => {
    api.recordOverExample.mockResolvedValue({ success: false, error: 'Ruby missing' })
    const { unmount } = renderPane()
    await recordOverFirstExample()
    await act(async () => {
      unmount()
    })
    await waitFor(() =>
      expect(api.saveRecording).toHaveBeenCalledWith(
        UNLISTED_SUITE_ID,
        expect.objectContaining({ steps: expect.arrayContaining([clickStep]) })
      )
    )
    expect(api.recordOverExample).toHaveBeenCalled()
    // Only how the save went: not that the steps are still here
    expect(mockToast.error).not.toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('tests.saved'))
  })

  describe('leaving with unsaved steps on screen saves them as a new test', () => {
    const refusedStop = async (): Promise<void> => {
      api.recordOverExample.mockResolvedValue({ success: false, error: 'notUnique', count: 2 })
      await recordOverFirstExample()
      await stopAndSave()
      await screen.findByRole('button', { name: 'testPage.saveAsNew' })
      mockToast.success.mockClear()
    }
    const savedOnceAsNewTest = async (): Promise<void> => {
      await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
      expect(api.saveRecording).toHaveBeenCalledWith(
        UNLISTED_SUITE_ID,
        expect.objectContaining({ name: 'logs in', steps: expect.arrayContaining([clickStep]) })
      )
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('tests.saved'))
      expect(useRecorderStore.getState().unsavedExample).toBeNull()
    }

    it('keeps the window open until they are saved, and Edit code waits for them', async () => {
      renderPane()
      await refusedStop()
      expect(api.setRecordingState).toHaveBeenLastCalledWith(true)
      expect(screen.getByRole('button', { name: 'testPage.editCode' })).toBeDisabled()
    })

    it('on unmount', async () => {
      const { unmount } = renderPane()
      await refusedStop()
      await act(async () => {
        unmount()
      })
      await savedOnceAsNewTest()
    })

    it('on a window-close flush, then answers main', async () => {
      let flush: (() => void) | null = null
      api.onFlushRecording.mockImplementation((cb: () => void) => {
        flush = cb
        return (): void => {}
      })
      renderPane()
      await refusedStop()
      await act(async () => {
        flush?.()
      })
      await savedOnceAsNewTest()
      await waitFor(() => expect(api.flushRecordingDone).toHaveBeenCalled())
    })

    it('on switching to another test in the list', async () => {
      api.listProjectTests.mockResolvedValue([
        { name: 'Login', file: 'spec/login_spec.rb', ownership: 'code' },
        { name: 'Signup', file: 'spec/signup_spec.rb', ownership: 'code' }
      ])
      render(
        <MemoryRouter
          initialEntries={[`/overview/tests/${toRouteParam('file:spec/login_spec.rb')}`]}
        >
          <Routes>
            <Route path="/overview/tests/:testKey" element={<TestsWorkspace />} />
          </Routes>
        </MemoryRouter>
      )
      await refusedStop()
      await act(async () => {
        fireEvent.click(await screen.findByText('Signup'))
      })
      await savedOnceAsNewTest()
      await waitFor(() => expect(api.openCodeTest).toHaveBeenCalledWith('spec/signup_spec.rb'))
    })
  })

  it('says so when the file cannot be opened', async () => {
    api.openCodeTest.mockRejectedValue(new Error('gone'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPane()
    expect(await screen.findByText('tests.actionFailed')).toBeInTheDocument()
    error.mockRestore()
  })

  it('uses the fixed copy', () => {
    expect(en.testPage).toMatchObject({
      overwriteConfirm: 'This test has code edits. Recording will replace them. Continue?',
      overwriteTarget: '“{{name}}” in {{file}}',
      exampleNotUnique: 'Raider couldn\'t find exactly one test named "{{name}}" in this file.',
      saveAsNew: 'Save as a new test',
      editCode: 'Edit code',
      run: 'Run',
      record: 'Record'
    })
  })
})
