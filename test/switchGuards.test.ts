import { describe, it, expect, beforeEach } from 'vitest'
import { anyEditorDirty, recorderBusy } from '@foundation/switchGuards'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useEditorStore from '@foundation/Stores/editorStore'

/** Switching projects mid-recording or with unsaved edits would lose work (U7). */
describe('switchGuards', () => {
  beforeEach(() => {
    useRecorderStore.setState({
      recordingTarget: null,
      isRecording: false,
      isReplayingToBreakpoint: false
    } as never)
    useEditorStore.setState({ pageDirty: false, inlineDirty: false })
  })

  it('is quiet when nothing is recording and nothing is edited', () => {
    expect(recorderBusy()).toBe(false)
    expect(anyEditorDirty()).toBe(false)
  })

  it('reports a recording, a pending recording target or a replay as busy', () => {
    useRecorderStore.setState({ isRecording: true } as never)
    expect(recorderBusy()).toBe(true)
    useRecorderStore.setState({ isRecording: false, isReplayingToBreakpoint: true } as never)
    expect(recorderBusy()).toBe(true)
    useRecorderStore.setState({ isReplayingToBreakpoint: false, recordingTarget: 'x' } as never)
    expect(recorderBusy()).toBe(true)
  })

  it('reports either editor as dirty', () => {
    useEditorStore.setState({ pageDirty: true })
    expect(anyEditorDirty()).toBe(true)
    useEditorStore.setState({ pageDirty: false, inlineDirty: true })
    expect(anyEditorDirty()).toBe(true)
  })
})
