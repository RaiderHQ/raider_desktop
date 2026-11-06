import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockOpenExternal = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ shell: { openExternal: mockOpenExternal } }))

import {
  installPermissionHandlers,
  installWindowGuards,
  isAppUrl,
  isExternalUrl,
  isSnapshotFrameUrl,
  openExternalUrl
} from '../../src/main/windowGuards'
import { RECORDER_PARTITION } from '../../src/shared/recorderSession'

const APP_FILE =
  'file:///Applications/Raider.app/Contents/Resources/app.asar/out/renderer/index.html'
const PRELOAD =
  '/Applications/Raider.app/Contents/Resources/app.asar/out/preload/recorderPreload.js'

describe('isExternalUrl', () => {
  it.each(['https://github.com/RaiderHQ', 'http://localhost:3000/report'])('allows %s', (url) =>
    expect(isExternalUrl(url)).toBe(true)
  )

  it.each([
    'file:///etc/passwd',
    'smb://evil/share',
    'javascript:alert(1)',
    'ms-settings:',
    'vscode://file/x',
    'not a url'
  ])('refuses %s', (url) => expect(isExternalUrl(url)).toBe(false))
})

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenExternal.mockResolvedValue(undefined)
  })

  it.each(['https://github.com/RaiderHQ', 'http://localhost:3000/'])('opens %s', (url) => {
    expect(openExternalUrl(url)).toBe(true)
    expect(mockOpenExternal).toHaveBeenCalledWith(url)
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'not a url'])('refuses %s', (url) => {
    expect(openExternalUrl(url)).toBe(false)
    expect(mockOpenExternal).not.toHaveBeenCalled()
  })

  it('catches and logs a rejected openExternal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const boom = new Error('boom')
    mockOpenExternal.mockRejectedValue(boom)
    expect(openExternalUrl('https://example.com/')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledWith('open external failed', boom)
    warn.mockRestore()
  })
})

describe('isAppUrl', () => {
  it('accepts the app page itself, with any hash route', () => {
    expect(isAppUrl(`${APP_FILE}#/tests`, APP_FILE)).toBe(true)
  })

  it('accepts the dev server origin', () => {
    expect(isAppUrl('http://localhost:5173/#/tests', 'http://localhost:5173')).toBe(true)
  })

  it.each([
    'file:///Users/me/Downloads/dropped.html',
    'https://example.com/',
    'http://localhost:5174/',
    'raider-media://file/x'
  ])('refuses %s', (url) => {
    expect(isAppUrl(url, APP_FILE)).toBe(false)
    expect(isAppUrl(url, 'http://localhost:5173')).toBe(false)
  })
})

describe('isSnapshotFrameUrl', () => {
  it.each(['about:srcdoc', 'about:blank', `${APP_FILE}#/x`])('allows %s', (url) =>
    expect(isSnapshotFrameUrl(url, APP_FILE)).toBe(true)
  )

  it('allows the dev server origin', () => {
    expect(isSnapshotFrameUrl('http://localhost:5173/#/x', 'http://localhost:5173')).toBe(true)
  })

  it.each([
    'https://example.com/',
    'http://127.0.0.1:55539/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,x',
    'raider-media://file/x',
    'about:srcdoc#x',
    'about:blank?x'
  ])('refuses %s', (url) => {
    expect(isSnapshotFrameUrl(url, APP_FILE)).toBe(false)
    expect(isSnapshotFrameUrl(url, 'http://localhost:5173')).toBe(false)
  })
})

describe('installWindowGuards', () => {
  let contents: EventEmitter & { setWindowOpenHandler: ReturnType<typeof vi.fn> }
  let openHandler: (details: { url: string }) => { action: string }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenExternal.mockResolvedValue(undefined)
    contents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn((h) => (openHandler = h))
    })
    installWindowGuards(contents as never, { appUrl: APP_FILE, recorderPreload: PRELOAD })
  })

  it('opens only http(s) links in the browser and never a new app window', () => {
    expect(openHandler({ url: 'https://ruby-raider.com' })).toEqual({ action: 'deny' })
    expect(mockOpenExternal).toHaveBeenCalledWith('https://ruby-raider.com')
    expect(openHandler({ url: 'file:///Applications/Calculator.app' })).toEqual({ action: 'deny' })
    expect(mockOpenExternal).toHaveBeenCalledTimes(1)
  })

  it('stops the main window from navigating away from the app', () => {
    const away = { preventDefault: vi.fn() }
    contents.emit('will-navigate', away, 'file:///Users/me/Downloads/dropped.html')
    expect(away.preventDefault).toHaveBeenCalled()

    const own = { preventDefault: vi.fn() }
    contents.emit('will-navigate', own, `${APP_FILE}#/settings`)
    expect(own.preventDefault).not.toHaveBeenCalled()
  })

  it('blocks subframe navigation away from the app', () => {
    const frameNavigation = (url: string, isMainFrame = false): ReturnType<typeof vi.fn> => {
      const preventDefault = vi.fn()
      contents.emit('will-frame-navigate', { url, isMainFrame, preventDefault })
      return preventDefault
    }
    // A link clicked inside a snapshot frame must not navigate it
    expect(frameNavigation('https://example.com/')).toHaveBeenCalled()
    expect(frameNavigation('file:///etc/passwd')).toHaveBeenCalled()
    expect(frameNavigation('about:srcdoc')).not.toHaveBeenCalled()
    expect(frameNavigation('about:blank')).not.toHaveBeenCalled()
    // will-navigate owns the main frame
    expect(frameNavigation('https://example.com/', true)).not.toHaveBeenCalled()
  })

  it("leaves the recorder webview's own navigation alone", () => {
    const guest = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() })
    contents.emit('did-attach-webview', {}, guest)
    expect(guest.listenerCount('will-frame-navigate')).toBe(0)
    expect(guest.listenerCount('will-navigate')).toBe(0)

    const preventDefault = vi.fn()
    guest.emit('will-frame-navigate', {
      url: 'https://example.com/next',
      isMainFrame: false,
      preventDefault
    })
    expect(preventDefault).not.toHaveBeenCalled()

    // and the webview still attaches with the frame guard installed
    const attach = { preventDefault: vi.fn() }
    contents.emit('will-attach-webview', attach, {}, { src: 'https://example.com/' })
    expect(attach.preventDefault).not.toHaveBeenCalled()
  })

  it('pins the webview to the recorder preload, isolation and partition', () => {
    const event = { preventDefault: vi.fn() }
    const webPreferences: Record<string, unknown> = {
      preload: '/tmp/evil.js',
      preloadURL: 'file:///tmp/evil.js',
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      partition: 'persist:other'
    }
    const params: Record<string, string> = { src: 'https://example.com', partition: '' }
    contents.emit('will-attach-webview', event, webPreferences, params)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(webPreferences).toEqual({
      preload: PRELOAD,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      webSecurity: true,
      partition: RECORDER_PARTITION
    })
    expect(params.partition).toBe(RECORDER_PARTITION)
  })

  it('keeps web security on and popups off in the webview', () => {
    const event = { preventDefault: vi.fn() }
    const webPreferences: Record<string, unknown> = { webSecurity: false }
    const params: Record<string, string> = { src: 'https://example.com', allowpopups: 'true' }
    contents.emit('will-attach-webview', event, webPreferences, params)
    expect(webPreferences.webSecurity).toBe(true)
    expect(params).not.toHaveProperty('allowpopups')
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('denies every popup from an attached webview', () => {
    let guestHandler: ((details: { url: string }) => { action: string }) | undefined
    const guest = { setWindowOpenHandler: vi.fn((h) => (guestHandler = h)) }
    contents.emit('did-attach-webview', {}, guest)
    expect(guestHandler!({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    expect(mockOpenExternal).not.toHaveBeenCalled()
  })

  it.each(['http://localhost:3000/', 'https://example.com/login', 'about:blank'])(
    'attaches a webview for %s',
    (src) => {
      const event = { preventDefault: vi.fn() }
      contents.emit('will-attach-webview', event, {}, { src })
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  )

  it.each([
    'file:///etc/hosts',
    'raider-media://file/%2Ftmp%2Fx.webm',
    'javascript:alert(1)',
    'data:text/html,<p>x</p>',
    ''
  ])('refuses a webview for %j', (src) => {
    const event = { preventDefault: vi.fn() }
    contents.emit('will-attach-webview', event, {}, { src })
    expect(event.preventDefault).toHaveBeenCalled()
  })
})

describe('installPermissionHandlers', () => {
  type Handler = (
    wc: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: { requestingUrl: string }
  ) => void
  const sessionWith = (): { setPermissionRequestHandler: ReturnType<typeof vi.fn> } => ({
    setPermissionRequestHandler: vi.fn()
  })
  const mainContents = { id: 1 }
  const otherContents = { id: 2 }
  const install = (): { app: Handler; recorder: Handler } => {
    const app = sessionWith()
    const recorder = sessionWith()
    installPermissionHandlers({
      app: app as never,
      recorder: recorder as never,
      appUrl: APP_FILE,
      isAppContents: (wc) => wc === (mainContents as never)
    })
    return {
      app: app.setPermissionRequestHandler.mock.calls[0][0] as Handler,
      recorder: recorder.setPermissionRequestHandler.mock.calls[0][0] as Handler
    }
  }
  const decide = (
    handler: Handler,
    permission: string,
    requestingUrl: string,
    wc: unknown = mainContents
  ): boolean => {
    let granted: boolean | undefined
    handler(wc, permission, (g) => (granted = g), { requestingUrl })
    return granted!
  }

  it("lets the app's own page read and write the clipboard, e.g. the editor's Paste", () => {
    const { app } = install()
    expect(decide(app, 'clipboard-read', `${APP_FILE}#/editor`)).toBe(true)
    expect(decide(app, 'clipboard-sanitized-write', `${APP_FILE}#/tests`)).toBe(true)
    expect(decide(app, 'fullscreen', APP_FILE)).toBe(true)
  })

  it('denies everything else, and the clipboard to other pages or windows', () => {
    const { app } = install()
    for (const permission of ['media', 'geolocation', 'notifications', 'openExternal']) {
      expect(decide(app, permission, APP_FILE)).toBe(false)
    }
    expect(decide(app, 'clipboard-read', 'https://example.com/')).toBe(false)
    expect(decide(app, 'clipboard-read', APP_FILE, otherContents)).toBe(false)
  })

  it('denies every permission to the websites being recorded', () => {
    const { recorder } = install()
    for (const permission of [
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'media',
      'notifications'
    ]) {
      expect(decide(recorder, permission, 'https://example.com/', otherContents)).toBe(false)
    }
  })
})
