import { createElement } from 'react'
import type { ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import { useTestRecording } from '../src/renderer/src/hooks/useTestRecording'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { toRouteParam } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, options?: object) => string } => ({
    t: (key: string, options?: object): string =>
      options ? `${key} ${JSON.stringify(options)}` : key
  })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }))

const step = (id: string): Test['steps'][number] => ({
  id,
  kind: 'navigate',
  url: 'https://x.test'
})
const test1: Test = {
  id: 't1',
  name: 'Login works',
  url: 'https://x.test/login',
  steps: [step('a'), step('b'), step('c')],
  ownership: 'recorded'
}
const suites = [{ id: 's1', name: 'Smoke', tests: [test1] }]

const listeners = new Map<string, (event: IpcRendererEvent, ...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.({} as IpcRendererEvent, ...args)
  })
}

const api = {
  getSuites: vi.fn(),
  saveRecording: vi.fn(),
  saveTrace: vi.fn(),
  loadUrlRequest: vi.fn(),
  startRecordingMain: vi.fn(),
  stopRecordingMain: vi.fn(),
  replayInWebview: vi.fn(),
  cancelReplay: vi.fn(),
  runTest: vi.fn(),
  runProjectFile: vi.fn(),
  listProjectTests: vi.fn(),
  setRecordingState: vi.fn(),
  onFlushRecording: vi.fn(),
  flushRecordingDone: vi.fn()
}

let flushRecording: (() => void) | null = null
let location = ''

const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
  createElement(
    MemoryRouter,
    {
      initialEntries: ['/overview/tests/x'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true }
    },
    children
  )

const mountHook = async (): Promise<{
  result: { current: ReturnType<typeof useTestRecording> }
  unmount: () => void
}> => {
  const hook = renderHook(
    () => {
      location = useLocation().pathname
      return useTestRecording()
    },
    { wrapper }
  )
  // Let useSuiteSync's first load settle
  await act(async () => {})
  return hook
}

const mount = async (): Promise<ReturnType<typeof useTestRecording>> =>
  (await mountHook()).result.current

/** Recording the open test, with its steps so far kept */
const recordingTest = async (rec: ReturnType<typeof useTestRecording>): Promise<void> => {
  await act(() => rec.start({ kind: 'test' }))
  act(() => useRecorderStore.getState().setBreakpointIndex(2))
  await emit('recording-started', 'https://x.test/login')
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  api.getSuites.mockResolvedValue(suites)
  api.saveRecording.mockResolvedValue({ success: true })
  api.loadUrlRequest.mockResolvedValue({ success: true })
  api.startRecordingMain.mockResolvedValue({
    success: true,
    url: 'https://x.test/login',
    preloadPath: '/preload.js'
  })
  api.replayInWebview.mockResolvedValue({ success: true })
  api.cancelReplay.mockResolvedValue({ success: true })
  api.runTest.mockResolvedValue({ success: true, output: 'ok' })
  api.saveTrace.mockResolvedValue({ success: true })
  api.listProjectTests.mockResolvedValue([])
  flushRecording = null
  api.onFlushRecording.mockImplementation((cb: () => void) => {
    flushRecording = cb
    return (): void => {
      flushRecording = null
    }
  })
  // @ts-expect-error - Mocking window.api
  window.api = api
  // @ts-expect-error - Mocking window.electron
  window.electron = {
    ipcRenderer: {
      on: (channel: string, cb: (event: IpcRendererEvent, ...args: unknown[]) => unknown) => {
        listeners.set(channel, cb)
        return (): boolean => listeners.delete(channel)
      }
    }
  }
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({ activeSuiteId: 's1', activeTest: test1 })
  useTestsListStore.setState({ rows: null })
  useProjectStore.setState({ layout: null })
  useRubyStore.setState({ rubyCommand: '/usr/bin/ruby' })
  useRunOutputStore.setState({ runOutput: '', runFailed: false })
})

afterEach(() => vi.useRealTimers())

describe('recorderStore.openTest', () => {
  it('opens the row’s test from its suite and keeps it through the first suite load', async () => {
    useRecorderStore.setState({ activeSuiteId: null, activeTest: null })
    useRecorderStore.getState().setReadOnlyView({ file: 'spec/x_spec.rb', examples: [] } as never)
    await useRecorderStore
      .getState()
      .openTest({ name: 'Login works', testId: 't1', ownership: 'recorded', suiteIds: ['s1'] })
    const s = useRecorderStore.getState()
    expect(s.activeSuiteId).toBe('s1')
    expect(s.activeTest).toEqual(test1)
    expect(s.readOnlyView).toBeNull()
    expect(s.openTarget).toEqual({ suiteId: 's1', testId: 't1' })
  })

  it('throws when no suite lists the test', async () => {
    await expect(
      useRecorderStore
        .getState()
        .openTest({ name: 'Gone', testId: 'nope', ownership: 'legacy', suiteIds: [] })
    ).rejects.toThrow()
  })
})

describe('useTestRecording', () => {
  it('start records the test from its URL and keeps the target', async () => {
    const rec = await mount()
    await act(() => rec.start({ kind: 'test' }))
    expect(api.loadUrlRequest).toHaveBeenCalledWith('https://x.test/login')
    expect(api.startRecordingMain).toHaveBeenCalled()
    expect(api.replayInWebview).not.toHaveBeenCalled()
    const s = useRecorderStore.getState()
    expect(s.recordingTarget).toEqual({ kind: 'test' })
    expect(s.recordingUrl).toBe('https://x.test/login')
    expect(s.preloadPath).toBe('/preload.js')
  })

  it('start for an example records into a fresh transient test', async () => {
    const rec = await mount()
    await act(() => rec.start({ kind: 'example', file: 'spec/a_spec.rb', exampleName: 'logs in' }))
    const s = useRecorderStore.getState()
    expect(s.activeTest).toMatchObject({ name: 'logs in', steps: [] })
    expect(s.activeTest?.id).not.toBe('t1')
    expect(s.recordingTarget).toEqual({
      kind: 'example',
      file: 'spec/a_spec.rb',
      exampleName: 'logs in'
    })
    expect(api.loadUrlRequest).toHaveBeenCalledWith('')
    // No suite lists it: autosave and suite updates must leave it alone
    expect(s.activeSuiteId).toBeNull()
    act(() => useRecorderStore.getState().setRecordingTarget(null))
  })

  describe('recording over a code example', () => {
    const click = {
      id: 'c1',
      kind: 'click' as const,
      element: { strategy: 'css' as const, value: '#go' }
    }
    const recordExample = async (rec: ReturnType<typeof useTestRecording>): Promise<void> => {
      await act(() =>
        rec.start({ kind: 'example', file: 'spec/a_spec.rb', exampleName: 'logs in' })
      )
      await emit('recording-started', 'https://x.test/base')
    }

    beforeEach(() => {
      Object.assign(api, { recordOverExample: vi.fn().mockResolvedValue({ success: true }) })
    })

    it('a stop with only the start page leaves the example alone', async () => {
      const rec = await mount()
      await recordExample(rec)
      await act(() => rec.stop())
      expect(
        (api as unknown as { recordOverExample: ReturnType<typeof vi.fn> }).recordOverExample
      ).not.toHaveBeenCalled()
      expect(api.saveRecording).not.toHaveBeenCalled()
    })

    it('is never autosaved, even after a suite update', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const rec = await mount()
      await recordExample(rec)
      const recordingId = useRecorderStore.getState().activeTest?.id
      await emit('suite-updated', suites)
      // The suite update must not swap the recording for a suite's test
      expect(useRecorderStore.getState().activeTest?.id).toBe(recordingId)
      act(() =>
        useRecorderStore
          .getState()
          .updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, click] } : p))
      )
      expect(useRecorderStore.getState().activeTest?.steps).toContainEqual(click)
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(api.saveRecording).not.toHaveBeenCalled()
      act(() => useRecorderStore.getState().setRecordingTarget(null))
    })

    it('a flush from main when the file refuses it saves the steps as a new test', async () => {
      ;(
        api as unknown as { recordOverExample: ReturnType<typeof vi.fn> }
      ).recordOverExample.mockResolvedValue({ success: false, error: 'notUnique', count: 2 })
      const rec = await mount()
      await recordExample(rec)
      act(() =>
        useRecorderStore
          .getState()
          .updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, click] } : p))
      )
      await act(async () => {
        flushRecording?.()
      })
      await vi.waitFor(() => expect(api.flushRecordingDone).toHaveBeenCalled())
      expect(api.saveRecording).toHaveBeenCalledWith(
        UNLISTED_SUITE_ID,
        expect.objectContaining({ name: 'logs in', steps: expect.arrayContaining([click]) })
      )
    })
  })

  it('start does nothing when the project cannot be recorded', async () => {
    useProjectStore.setState({ layout: { recordable: false } as never })
    const rec = await mount()
    await act(() => rec.start({ kind: 'test' }))
    expect(api.startRecordingMain).not.toHaveBeenCalled()
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
  })

  it('start says so and forgets the target when there is no start URL', async () => {
    api.startRecordingMain.mockResolvedValue({ success: false, url: '', preloadPath: '' })
    const rec = await mount()
    await act(() => rec.start({ kind: 'test' }))
    expect(mockToast.error).toHaveBeenCalledWith('recorder.noStartUrl')
    expect(useRecorderStore.getState().recordingTarget).toBeNull()
    expect(useRecorderStore.getState().recordingUrl).toBeNull()
  })

  it('continueRecording replays every step, then keeps them when recording starts', async () => {
    vi.useFakeTimers()
    const rec = await mount()
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = rec.continueRecording({ kind: 'test' })
    })
    expect(useRecorderStore.getState().breakpointIndex).toBe(2)
    expect(useRecorderStore.getState().isReplayingToBreakpoint).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await done
    })
    expect(api.replayInWebview).toHaveBeenCalledWith(test1.steps)
    expect(useRecorderStore.getState().isReplayingToBreakpoint).toBe(false)
    expect(useRecorderStore.getState().recordingTarget).toEqual({ kind: 'test' })
    await emit('recording-started', 'https://x.test/login')
    expect(useRecorderStore.getState().activeTest?.steps).toEqual(test1.steps)
    expect(useRecorderStore.getState().isRecording).toBe(true)
  })

  it('stop for a test closes the browser and saves the test to its suite', async () => {
    const rec = await mount()
    await act(() => rec.start({ kind: 'test' }))
    await emit('recording-started', 'https://x.test/login')
    await emit('new-recorded-step', step('n'))
    api.saveRecording.mockClear()
    await act(() => rec.stop())
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', steps: [expect.anything(), step('n')] })
    )
    const s = useRecorderStore.getState()
    expect(s.recordingTarget).toBeNull()
    expect(s.recordingUrl).toBeNull()
    expect(s.preloadPath).toBeNull()
  })

  it('stop with no target only closes the browser', async () => {
    const rec = await mount()
    api.saveRecording.mockClear()
    await act(() => rec.stop())
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(api.saveRecording).not.toHaveBeenCalled()
  })

  describe('a new test (draft)', () => {
    const recordingDraft = async (rec: ReturnType<typeof useTestRecording>): Promise<void> => {
      act(() => useRecorderStore.getState().startDraft('Add to cart', 'https://x.test'))
      await act(() => rec.start({ kind: 'draft', suiteId: 'not-in-a-suite' }))
      await emit('recording-started', 'https://x.test/login')
    }

    it('stop saves a recorded draft into its suite once, then forgets the draft', async () => {
      const rec = await mount()
      await recordingDraft(rec)
      await emit('new-recorded-step', step('c'))
      const id = useRecorderStore.getState().draftTest!.id

      await act(() => rec.stop())

      expect(api.saveRecording).toHaveBeenCalledTimes(1)
      expect(api.saveRecording).toHaveBeenCalledWith(
        'not-in-a-suite',
        expect.objectContaining({ id, name: 'Add to cart', url: 'https://x.test' })
      )
      expect(useRecorderStore.getState().draftTest).toBeNull()
      expect(location).toBe(`/overview/tests/${toRouteParam(`id:${id}`)}`)
    })

    it('stop drops a draft with only its start page and goes back to the list', async () => {
      const rec = await mount()
      await recordingDraft(rec)

      await act(() => rec.stop())

      expect(api.saveRecording).not.toHaveBeenCalled()
      expect(api.saveTrace).not.toHaveBeenCalled()
      expect(useRecorderStore.getState().draftTest).toBeNull()
      expect(location).toBe('/overview/tests')
    })

    it('leave drops an empty draft without navigating', async () => {
      const rec = await mount()
      await recordingDraft(rec)

      await act(() => rec.leave())

      expect(api.saveRecording).not.toHaveBeenCalled()
      expect(location).toBe('/overview/tests/x')
    })

    it('is never autosaved, even with a suite open', async () => {
      const rec = await mount()
      await recordingDraft(rec)
      await emit('new-recorded-step', step('c'))
      vi.useFakeTimers()
      try {
        act(() => {
          // Recording failed to save, say: the draft is open, not recording, with a suite set
          useRecorderStore.setState({ recordingTarget: null, isRecording: false })
          useRecorderStore.getState().setActiveSuiteId('s1')
          useRecorderStore
            .getState()
            .updateActiveTest((p) => (p ? { ...p, name: 'Add to basket' } : p))
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000)
        })
        expect(api.saveRecording).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('opening a test does not autosave it; editing it does', async () => {
    await mount()
    vi.useFakeTimers()
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(api.saveRecording).not.toHaveBeenCalled()
      act(() =>
        useRecorderStore.getState().updateActiveTest((p) => (p ? { ...p, url: 'https://y' } : p))
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(api.saveRecording).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 't1' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancelReplay ends the replay and the recording', async () => {
    const rec = await mount()
    act(() => {
      useRecorderStore.setState({ isReplayingToBreakpoint: true, breakpointIndex: 1 })
      useRecorderStore.getState().setRecordingTarget({ kind: 'test' })
      useRecorderStore.getState().setRecordingBrowser({ url: 'u', preloadPath: 'p' })
    })
    await act(() => rec.cancelReplay())
    expect(api.cancelReplay).toHaveBeenCalled()
    expect(api.stopRecordingMain).toHaveBeenCalled()
    const s = useRecorderStore.getState()
    expect(s.isReplayingToBreakpoint).toBe(false)
    expect(s.breakpointIndex).toBeNull()
    expect(s.recordingUrl).toBeNull()
    expect(s.recordingTarget).toBeNull()
  })

  it('run runs the recorded test with its current steps', async () => {
    const rec = await mount()
    await act(() => rec.run())
    expect(api.runTest).toHaveBeenCalledWith('s1', 't1', '.', '/usr/bin/ruby', test1)
    expect(useRunOutputStore.getState().runOutput).toBe('ok')
  })

  it('run runs a test edited in code from its file', async () => {
    const edited: Test = { ...test1, ownership: 'codeOwnedWasRecorded', file: 'spec/login_spec.rb' }
    api.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [edited] }])
    useRecorderStore.setState({ activeTest: edited })
    api.runProjectFile.mockResolvedValue({ success: false, output: 'boom' })
    const rec = await mount()
    await act(() => rec.run())
    expect(api.runProjectFile).toHaveBeenCalledWith('spec/login_spec.rb', '/usr/bin/ruby')
    expect(useRunOutputStore.getState().runFailed).toBe(true)
  })

  it('autosaves a recorded test 500 ms after it changes', async () => {
    vi.useFakeTimers()
    await mount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    api.saveRecording.mockClear()
    act(() =>
      useRecorderStore.getState().updateActiveTest((p) => (p ? { ...p, url: 'https://y' } : p))
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(api.saveRecording).toHaveBeenCalledTimes(1)
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ url: 'https://y' })
    )
  })

  it('stop says where the test was saved, refreshes the list and opens the test', async () => {
    api.saveRecording.mockResolvedValue({
      success: true,
      test: { ...test1, file: 'spec/login_works_spec.rb' }
    })
    api.listProjectTests.mockResolvedValue([
      { name: 'Login works', file: 'spec/login_works_spec.rb', testId: 't1', ownership: 'recorded' }
    ])
    const rec = await mount()
    await recordingTest(rec)
    await act(() => rec.stop())
    expect(mockToast.success).toHaveBeenCalledWith(
      `tests.saved ${JSON.stringify({ name: 'Login works', file: 'spec/login_works_spec.rb' })}`
    )
    expect(useTestsListStore.getState().rows).toEqual([
      expect.objectContaining({ testId: 't1', file: 'spec/login_works_spec.rb' })
    ])
    expect(location).toBe(`/overview/tests/${toRouteParam('id:t1')}`)
    expect(useRecorderStore.getState().isRecording).toBe(false)
  })

  it('stop says the recording was not saved when the test was changed in code', async () => {
    api.saveRecording.mockResolvedValue({ success: false, error: 'codeOwned' })
    const rec = await mount()
    await recordingTest(rec)
    await emit('new-recorded-step', step('n'))
    await act(() => rec.stop())
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith('tests.saveRefusedCodeOwned')
    // The steps stay on screen
    expect(useRecorderStore.getState().activeTest?.steps).toEqual([...test1.steps, step('n')])
    expect(location).toBe('/overview/tests/x')
    expect(useRecorderStore.getState().activeTest?.ownership).toBe('codeOwnedWasRecorded')
  })

  it('stop says it saved when the project keeps no test files', async () => {
    api.saveRecording.mockResolvedValue({ success: true })
    const rec = await mount()
    await recordingTest(rec)
    await act(() => rec.stop())
    expect(mockToast.success).toHaveBeenCalledWith(
      `tests.savedNoFile ${JSON.stringify({ name: 'Login works' })}`
    )
    expect(location).toBe(`/overview/tests/${toRouteParam('id:t1')}`)
  })

  it('stop saves the trace once, even when main reports the stop afterwards', async () => {
    const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }
    const rec = await mount()
    await recordingTest(rec)
    await emit('new-trace-step', traceStep)
    await act(() => rec.stop())
    await emit('recording-stopped')
    expect(api.saveTrace).toHaveBeenCalledTimes(1)
    expect(api.saveTrace).toHaveBeenCalledWith('t1', [traceStep])
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', hasTrace: true })
    )
    expect(useRecorderStore.getState().activeTest?.hasTrace).toBe(true)
  })

  it("a stop that saves nothing leaves the trace to main's recording-stopped", async () => {
    const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }
    const rec = await mount()
    await recordingTest(rec)
    await emit('new-trace-step', traceStep)
    // The target is gone (e.g. replay cancelled): only the old path saves the trace
    act(() => useRecorderStore.getState().setRecordingTarget(null))
    await act(() => rec.stop())
    await emit('recording-stopped')
    expect(api.saveTrace).toHaveBeenCalledTimes(1)
  })

  it('steps that arrive after another test was opened never reach it', async () => {
    const other: Test = { id: 't2', name: 'Other', url: '', steps: [], ownership: 'recorded' }
    const rec = await mount()
    await recordingTest(rec)
    await act(() => rec.leave())
    act(() => useRecorderStore.getState().setActiveTest(other))
    await emit('new-recorded-step', step('late'))
    await emit('new-trace-step', { id: 'tr' })
    expect(useRecorderStore.getState().activeTest).toEqual(other)
  })

  it('tells main whether it is recording', async () => {
    const rec = await mount()
    expect(api.setRecordingState).toHaveBeenLastCalledWith(false)
    await recordingTest(rec)
    expect(api.setRecordingState).toHaveBeenLastCalledWith(true)
    await act(() => rec.stop())
    expect(api.setRecordingState).toHaveBeenLastCalledWith(false)
  })

  it('a flush from main saves the recording, then answers', async () => {
    const rec = await mount()
    await recordingTest(rec)
    await emit('new-recorded-step', step('n'))
    api.saveRecording.mockClear()
    await act(async () => {
      flushRecording?.()
    })
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ steps: [...test1.steps, step('n')] })
    )
    expect(api.flushRecordingDone).toHaveBeenCalledTimes(1)
  })

  it('a flush with nothing recording only answers', async () => {
    await mount()
    api.saveRecording.mockClear()
    await act(async () => {
      flushRecording?.()
    })
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(api.flushRecordingDone).toHaveBeenCalledTimes(1)
  })

  it('unmounting while recording saves the recording and tells main it stopped', async () => {
    const { result, unmount } = await mountHook()
    await recordingTest(result.current)
    api.saveRecording.mockClear()
    unmount()
    expect(api.stopRecordingMain).toHaveBeenCalled()
    await act(async () => {})
    expect(api.saveRecording).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 't1' }))
    expect(api.setRecordingState).toHaveBeenLastCalledWith(false)
  })
})
