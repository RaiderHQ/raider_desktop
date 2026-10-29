import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockOpenExternal = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ shell: { openExternal: mockOpenExternal } }))

import {
  installPermissionHandlers,
  installWindowGuards,
  isAppUrl,
  isExternalUrl
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

describe('installWindowGuards', () => {
  let contents: EventEmitter & { setWindowOpenHandler: ReturnType<typeof vi.fn> }
  let openHandler: (details: { url: string }) => { action: string }

  beforeEach(() => {
    vi.clearAllMocks()
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
      partition: RECORDER_PARTITION
    })
    expect(params.partition).toBe(RECORDER_PARTITION)
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
