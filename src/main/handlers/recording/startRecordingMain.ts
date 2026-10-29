import { join } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { appState } from '../appState'
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

function startRecordingMain(): StartRecordingResult {
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

  // Return the URL and preload path so the renderer can create an embedded webview
  const preloadPath = RECORDER_PRELOAD

  appState.mainWindow?.webContents.send('recording-started', url)

  return { success: true, url, preloadPath }
}

export default startRecordingMain
