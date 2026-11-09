import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ipcSubscriptions } from './helpers/ipcSubscriptions'
import { useRecordingIPC } from '../src/renderer/src/hooks/useRecordingIPC'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Test } from '@foundation/Types/test'

const listeners = new Map<string, (...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.(...args)
  })
}

const test1: Test = {
  id: 't1',
  name: 'Login works',
  url: 'https://x.test/login',
  steps: [
    { id: 'a', kind: 'navigate', url: 'https://x.test' },
    { id: 'b', kind: 'click', element: { strategy: 'css', value: '#go' } }
  ],
  trace: [{ id: 'tr1', stepId: 'b', command: '', timestamp: 1, url: '' }]
}

const saveTrace = vi.fn()

beforeEach(() => {
  listeners.clear()
  saveTrace.mockReset().mockResolvedValue({ success: true })
  // @ts-expect-error - Mocking window.api
  window.api = { saveTrace }
  Object.assign(window.api, ipcSubscriptions(listeners))
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({
    activeTestSaved: true,
    activeTest: test1,
    recordingTarget: { kind: 'pick', stepId: 'b' },
    breakpointIndex: 0
  })
})

describe('useRecordingIPC while picking an element', () => {
  it('keeps the steps and the trace when the recorder starts, and is not recording', async () => {
    renderHook(() => useRecordingIPC({ setAssertionInfo: vi.fn() }))
    await emit('recording-started', 'https://x.test/login')
    const s = useRecorderStore.getState()
    expect(s.activeTest).toEqual(test1)
    expect(s.isRecording).toBe(false)
    expect(s.breakpointIndex).toBe(0)
  })

  it('adds no step, check or picture', async () => {
    const setAssertionInfo = vi.fn()
    renderHook(() => useRecordingIPC({ setAssertionInfo }))
    await emit('recording-started', 'https://x.test/login')
    await emit('new-recorded-step', { id: 'n', kind: 'click', element: { strategy: 'css', value: '#x' } })
    await emit('add-assertion-step', { id: 'm', kind: 'assert', check: 'visible' })
    await emit('new-trace-step', { id: 'tr2', stepId: 'n', command: '', timestamp: 2, url: '' })
    expect(useRecorderStore.getState().activeTest).toEqual(test1)
    expect(setAssertionInfo).not.toHaveBeenCalled()
  })

  it('saves no trace when it stops', async () => {
    renderHook(() => useRecordingIPC({ setAssertionInfo: vi.fn() }))
    await emit('recording-stopped')
    expect(saveTrace).not.toHaveBeenCalled()
  })
})

describe('useRecordingIPC while picking for a check', () => {
  it('a navigation while picking for a check clears the banner and keeps recording', async () => {
    useRecorderStore.setState({ recordingTarget: { kind: 'test' }, isRecording: true })
    useRecorderStore.getState().setAssertPicking(true)
    renderHook(() => useRecordingIPC({ setAssertionInfo: vi.fn() }))
    await emit('recorder-picked', { cancelled: true, reason: 'navigated' })
    const s = useRecorderStore.getState()
    expect(s.assertPicking).toBe(false)
    expect(s.isRecording).toBe(true)
  })
})

describe('useRecordingIPC while recording a flow', () => {
  beforeEach(() => {
    useRecorderStore.setState({
      activeTest: { ...test1, kind: 'flow' },
      recordingTarget: { kind: 'test' },
      isRecording: true
    })
  })

  it('adds no check or wait the menu sends, and asks for no expected text', async () => {
    const setAssertionInfo = vi.fn()
    renderHook(() => useRecordingIPC({ setAssertionInfo }))
    await emit('add-assertion-step', { id: 'm', kind: 'assert', check: 'displayed' })
    await emit('add-assertion-step', { pendingAssertion: 'titleEquals', text: 'Home' })
    expect(useRecorderStore.getState().activeTest?.steps).toEqual(test1.steps)
    expect(setAssertionInfo).not.toHaveBeenCalled()
  })

  it('still adds a check to a test', async () => {
    useRecorderStore.setState({ activeTest: test1 })
    renderHook(() => useRecordingIPC({ setAssertionInfo: vi.fn() }))
    await emit('add-assertion-step', { id: 'm', kind: 'assert', check: 'displayed' })
    expect(useRecorderStore.getState().activeTest?.steps.at(-1)?.id).toBe('m')
  })
})
