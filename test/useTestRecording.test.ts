import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import { useTestRecording } from '../src/renderer/src/hooks/useTestRecording'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import type { Test } from '@foundation/Types/test'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
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
  runProjectFile: vi.fn()
}

const mount = async (): Promise<ReturnType<typeof useTestRecording>> => {
  const { result } = renderHook(() => useTestRecording())
  // Let useSuiteSync's first load settle
  await act(async () => {})
  return result.current
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

  it('stop refuses draft targets until they are supported', async () => {
    const rec = await mount()
    useRecorderStore.getState().setRecordingTarget({ kind: 'draft', suiteId: 's1' })
    await expect(rec.stop()).rejects.toThrow('draft')
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
})
