import useRecorderStore from '@foundation/Stores/recorderStore'
import useEditorStore from '@foundation/Stores/editorStore'

/**
 * Whether leaving the current project would lose work. Shared by the File menu commands
 * (which stand down silently) and the project menu on the Overview (which says why).
 */

/** Switching projects mid-recording would save the recording into the wrong project */
export const recorderBusy = (): boolean => {
  const { recordingTarget, isRecording, isReplayingToBreakpoint } = useRecorderStore.getState()
  return !!recordingTarget || isRecording || isReplayingToBreakpoint
}

/** The full-page editor has unsaved changes */
export const pageEditorDirty = (): boolean => useEditorStore.getState().pageDirty

/** Either editor (full-page or the Files tab's inline one) has unsaved changes */
export const anyEditorDirty = (): boolean =>
  pageEditorDirty() || useEditorStore.getState().inlineDirty
