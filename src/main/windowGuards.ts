import { shell } from 'electron'
import { RECORDER_PARTITION } from '../shared/recorderSession'

/** Links the app may hand to the system browser: web pages only, never files or app schemes. */
export function isExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * True when `url` is the app's own page: the dev server's origin, or the bundled
 * index.html (any hash route). A dropped .html file or a website is not.
 */
export function isAppUrl(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const app = new URL(appUrl)
    if (app.protocol === 'file:')
      return target.protocol === 'file:' && target.pathname === app.pathname
    return target.origin === app.origin
  } catch {
    return false
  }
}

/**
 * Locks down the main window: links open in the browser (http(s) only), the window
 * never navigates away from the app, and the recorder <webview> always gets the
 * recorder preload, an isolated world and its own session, whatever the page asks for.
 */
export function installWindowGuards(
  contents: Electron.WebContents,
  { appUrl, recorderPreload }: { appUrl: string; recorderPreload: string }
): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, appUrl)) event.preventDefault()
  })

  contents.on('will-attach-webview', (_event, webPreferences, params) => {
    // Older Electron passed the webview's preload attribute as preloadURL
    delete (webPreferences as { preloadURL?: string }).preloadURL
    webPreferences.preload = recorderPreload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.partition = RECORDER_PARTITION
    params.partition = RECORDER_PARTITION
  })
}
