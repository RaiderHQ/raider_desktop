import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServer, type Server } from 'http'
import type { Socket } from 'net'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  checkMobileReady,
  checkMobileReadyHandler
} from '../../../src/main/handlers/mobile/checkMobileReady'

const caps = (app: string): string =>
  `platformName: 'iOS'\nappium:options:\n  deviceName: 'iPhone 15'\n  app: '${app}'\n`

const crossCaps = (iosApp: string, androidApp: string): string =>
  `ios:\n  platformName: 'iOS'\n  appium:options:\n    app: '${iosApp}'\nandroid:\n  platformName: 'Android'\n  appium:options:\n    app: '${androidApp}'\n`

let root: string
let project: string
let server: Server | null
let sockets: Set<Socket>
let requests: number

async function startServer(status: number | 'hang'): Promise<string> {
  server = createServer((_req, res) => {
    requests++
    if (status === 'hang') return
    res.statusCode = status
    res.end('{}')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/status`
}

async function closedPortUrl(): Promise<string> {
  const url = await startServer(200)
  await stopServer()
  return url
}

async function stopServer(): Promise<void> {
  if (!server) return
  for (const socket of sockets) socket.destroy()
  const closing = server
  server = null
  await new Promise<void>((resolve) => closing.close(() => resolve()))
}

async function writeCaps(text: string | null, dir = project): Promise<void> {
  await mkdir(join(dir, 'config'), { recursive: true })
  if (text !== null) await writeFile(join(dir, 'config', 'capabilities.yml'), text)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mobile-ready-'))
  project = join(root, 'my project')
  await mkdir(project)
  server = null
  sockets = new Set()
  requests = 0
})

afterEach(async () => {
  await stopServer()
  await rm(root, { recursive: true, force: true })
})

describe('checkMobileReady', () => {
  describe('Appium', () => {
    beforeEach(async () => {
      await mkdir(join(project, 'RaiderTestApp.app'))
      await writeCaps(caps('RaiderTestApp.app'))
    })

    it('is ready when Appium answers 200', async () => {
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })

    it('is ready when Appium answers any status, such as 500', async () => {
      const statusUrl = await startServer(500)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })

    it('reports a closed port', async () => {
      const statusUrl = await closedPortUrl()
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({
        ok: false,
        reason: 'appium',
        detail: '127.0.0.1:4723'
      })
    })

    it('gives up on a server that never responds', async () => {
      const statusUrl = await startServer('hang')
      const started = Date.now()
      const result = await checkMobileReady(project, { statusUrl, timeoutMs: 100, env: {} })
      expect(result).toEqual({ ok: false, reason: 'appium', detail: '127.0.0.1:4723' })
      expect(Date.now() - started).toBeLessThan(1000)
    })
  })

  describe('app file', () => {
    it('reports a missing app, as written in the file', async () => {
      await writeCaps(caps('RaiderTestApp.app'))
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({
        ok: false,
        reason: 'app',
        detail: 'RaiderTestApp.app'
      })
      expect(requests).toBe(0)
    })

    it.each(["app: ''", ''])('asks to choose the app when it is empty (%j)', async (line) => {
      await writeCaps(`platformName: 'iOS'\nappium:options:\n  deviceName: 'iPhone'\n  ${line}\n`)
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({
        ok: false,
        reason: 'app',
        detail: ''
      })
      expect(requests).toBe(0)
    })

    it('accepts an app bundle that is a directory, under a path with a space', async () => {
      await mkdir(join(project, 'RaiderTestApp.app'))
      await writeCaps(caps('RaiderTestApp.app'))
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })

    it('accepts an app file', async () => {
      await writeFile(join(project, 'app.apk'), 'x')
      await writeCaps(caps('app.apk'))
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })

    it('accepts an absolute path elsewhere', async () => {
      const elsewhere = join(root, 'builds', 'Other.app')
      await mkdir(elsewhere, { recursive: true })
      await writeCaps(caps(elsewhere))
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })

    it('checks the platform that cross-platform runs on', async () => {
      await mkdir(join(project, 'Ios.app'))
      await writeCaps(crossCaps('Ios.app', 'missing.apk'))
      await writeFile(join(project, 'config', 'config.yml'), 'platform: android\n')
      const statusUrl = await startServer(200)
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({
        ok: false,
        reason: 'app',
        detail: 'missing.apk'
      })
      await writeFile(join(project, 'config', 'config.yml'), 'platform: ios\n')
      expect(await checkMobileReady(project, { statusUrl, env: {} })).toEqual({ ok: true })
    })
  })

  describe('skipping', () => {
    it('skips every check on BrowserStack', async () => {
      await writeCaps(caps('RaiderTestApp.app'))
      const statusUrl = await startServer(200)
      const result = await checkMobileReady(project, {
        statusUrl,
        env: { TEST_ENV: 'browserstack' }
      })
      expect(result).toEqual({ ok: true })
      expect(requests).toBe(0)
    })

    it('is ready for a project that is not mobile', async () => {
      await writeCaps(null)
      expect(
        await checkMobileReady(project, { statusUrl: await closedPortUrl(), env: {} })
      ).toEqual({ ok: true })
    })
  })

  describe('handler', () => {
    afterEach(async () => {
      await setActiveProject(null)
    })

    it('rejects a path that is not the active project', async () => {
      await mkdir(join(project, 'RaiderTestApp.app'))
      await writeCaps(caps('RaiderTestApp.app'))
      await setActiveProject(join(root, 'elsewhere'))
      expect(await checkMobileReadyHandler(project)).toEqual({ error: 'This project is not open.' })
      expect(await checkMobileReadyHandler(42)).toEqual({ error: 'This project is not open.' })
      expect(requests).toBe(0)
    })

    it('says the project could not be checked on an unexpected error', async () => {
      await mkdir(join(project, 'config', 'capabilities.yml'), { recursive: true })
      await setActiveProject(project)
      expect(await checkMobileReadyHandler(project)).toEqual({
        error: "Couldn't check this project."
      })
    })
  })
})
