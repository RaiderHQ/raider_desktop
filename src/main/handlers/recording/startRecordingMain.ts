import { join } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { appState } from '../appState'

function startRecordingMain(): { success: boolean; url: string; preloadPath: string } {
  // Create trace temp directory
  const traceDir = join(tmpdir(), 'raider-traces', randomUUID())
  mkdirSync(traceDir, { recursive: true })
  appState.activeTraceDir = traceDir

  // Return the URL and preload path so the renderer can create an embedded webview
  const preloadPath = join(__dirname, '../preload/recorderPreload.js')

  appState.mainWindow?.webContents.send('recording-started', appState.projectBaseUrl)

  return { success: true, url: appState.projectBaseUrl, preloadPath }
}

export default startRecordingMain
