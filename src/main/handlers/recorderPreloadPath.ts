import { join } from 'path'

/**
 * Handles the 'get-recorder-preload-path' IPC call.
 * It resolves the absolute path to the webview's specific preload script
 * and returns it with the required 'file://' protocol prefix.
 */
const recorderPreloadPath = (): string => {
  // This path is relative to your main process file's location after build.
  // Adjust '../preload/recorderPreload.js' if your output structure is different.
  const preloadPath = join(__dirname, '../preload/recorderPreload.ts')
  return `file://${preloadPath}`
}

export default recorderPreloadPath
