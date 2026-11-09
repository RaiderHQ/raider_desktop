import { join } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { appState, type RecordingMode } from '../appState'
import { toRecordableUrl } from '../../../shared/recordUrl'

/** The recorder webview's preload; the window guards pin every webview to it. */
export const RECORDER_PRELOAD = join(__dirname, '../preload/recorderPreload.js')

export interface StartRecordingResult {
  success: boolean
  url: string
  preloadPath: string
  /** Why it didn't start: the address isn't an http(s) website the recorder can open */
  reason?: 'unsupportedUrl'
}

/** The renderer's `{ mode }`, untrusted: only exactly `{ mode: 'flow' }` records a flow */
export function recordingModeFrom(options: unknown): RecordingMode {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) return 'test'
  return (options as Record<string, unknown>).mode === 'flow' ? 'flow' : 'test'
}

function startRecordingMain(options?: unknown): StartRecordingResult {
  const mode = recordingModeFrom(options)
  const saved = appState.sessionUrl ?? appState.recorderSettings.baseUrl
  // Nothing to open: the renderer tells the user to set a URL
  if (!saved) return { success: false, url: '', preloadPath: '' }
  // An address without a scheme gets https://, as Quick record does
  const url = toRecordableUrl(saved)
  if (!url) return { success: false, url: '', preloadPath: '', reason: 'unsupportedUrl' }

  // Create trace temp directory
  const traceDir = join(tmpdir(), 'raider-traces', randomUUID())
  mkdirSync(traceDir, { recursive: true })
  appState.activeTraceDir = traceDir
  appState.recordingMode = mode

  // Return the URL and preload path so the renderer can create an embedded webview
  const preloadPath = RECORDER_PRELOAD

  appState.mainWindow?.webContents.send('recording-started', url)

  return { success: true, url, preloadPath }
}

export default startRecordingMain
