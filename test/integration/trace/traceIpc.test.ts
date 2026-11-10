// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => '') }
}))

import { dialog, type BrowserWindow, type IpcMain } from 'electron'
import {
  resolveTracePath,
  openTrace,
  openTraceFromDialog,
  registerTraceIpc
} from '../../../src/main/handlers/trace/traceIpc'
import { appState } from '../../../src/main/handlers/appState'

import en from '../../../src/renderer/src/assets/translations/en.json'

const FIXTURE = path.join(__dirname, '../../fixtures/trace-v1/trace.zip')

let root: string
let attachments: string
let zip: string
let otherProject: string

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-ipc-')))
  attachments = path.join(root, 'raider-results', 'attachments')
  fs.mkdirSync(attachments, { recursive: true })
  zip = path.join(attachments, '0-trace.zip')
  fs.copyFileSync(FIXTURE, zip)
  const shard = path.join(root, 'raider-results', 'attachments-2')
  fs.mkdirSync(shard)
  fs.copyFileSync(FIXTURE, path.join(shard, '1-trace.zip'))
  const other = path.join(root, 'raider-results', 'other')
  fs.mkdirSync(other)
  fs.copyFileSync(FIXTURE, path.join(other, 'x.zip'))
  fs.mkdirSync(path.join(attachments, 'sub'))
  fs.copyFileSync(FIXTURE, path.join(attachments, 'sub', 'x.zip'))
  fs.copyFileSync(FIXTURE, path.join(root, 'outside.zip'))
  fs.symlinkSync(zip, path.join(attachments, 'link.zip'))
  // A directory with the attachments shape whose real path leaves it.
  fs.mkdirSync(path.join(root, 'elsewhere'))
  fs.copyFileSync(FIXTURE, path.join(root, 'elsewhere', 'x.zip'))
  fs.symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'raider-results', 'attachments-3'))
  fs.symlinkSync(path.join(root, 'outside.zip'), path.join(root, 'outside-link.zip'))
  // Another project with a well-formed results folder.
  otherProject = path.join(root, 'other-project')
  fs.mkdirSync(path.join(otherProject, 'raider-results', 'attachments'), { recursive: true })
  fs.copyFileSync(FIXTURE, path.join(otherProject, 'raider-results', 'attachments', '0-trace.zip'))
})

beforeEach(() => {
  appState.projectPath = root
})

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(dialog.showOpenDialog).mockReset()
})

describe('resolveTracePath result', () => {
  const result = (p: string): { kind: 'result'; path: string } => ({ kind: 'result', path: p })

  it('accepts a trace under raider-results/attachments and attachments-N', async () => {
    expect(await resolveTracePath(result(zip))).toBe(zip)
    const shard = path.join(root, 'raider-results', 'attachments-2', '1-trace.zip')
    expect(await resolveTracePath(result(shard))).toBe(shard)
  })

  it('refuses paths outside the attachments shape, links and relative paths', async () => {
    const refused = [
      path.join(root, 'raider-results', 'other', 'x.zip'),
      path.join(attachments, 'sub', 'x.zip'),
      path.join(attachments, 'link.zip'),
      path.join(root, 'raider-results', 'attachments-3', 'x.zip'),
      'raider-results/attachments/0-trace.zip'
    ]
    for (const p of refused) expect(await resolveTracePath(result(p)), p).toBeNull()
  })

  it("refuses another project's trace, and any trace with no active project", async () => {
    const elsewhere = path.join(otherProject, 'raider-results', 'attachments', '0-trace.zip')
    expect(await resolveTracePath(result(elsewhere))).toBeNull()
    appState.projectPath = otherProject
    expect(await resolveTracePath(result(elsewhere))).toBe(elsewhere)
    expect(await resolveTracePath(result(zip))).toBeNull()
    appState.projectPath = null
    expect(await resolveTracePath(result(elsewhere))).toBeNull()
  })

  it("refuses a trace from the active project's flow-results (removed with flows)", async () => {
    const flowZip = path.join(root, 'flow-results', 'hello', '20261110T110856Z', 'attachments')
    fs.mkdirSync(flowZip, { recursive: true })
    fs.copyFileSync(FIXTURE, path.join(flowZip, '0-trace.zip'))
    const file = path.join(flowZip, '0-trace.zip')
    expect(fs.existsSync(file)).toBe(true)
    expect(await resolveTracePath(result(file))).toBeNull()
    expect(await openTrace(result(file))).toEqual({ ok: false, error: 'notFound' })
    // The project's own raider-results trace still opens
    expect(await resolveTracePath(result(zip))).toBe(zip)
  })

  it('refuses a UNC path on win32 before any fs call', async () => {
    const lstat = vi.spyOn(fs.promises, 'lstat')
    const realpath = vi.spyOn(fs.promises, 'realpath')
    expect(
      await resolveTracePath(result('\\\\host\\share\\raider-results\\attachments\\x.zip'), 'win32')
    ).toBeNull()
    expect(lstat).not.toHaveBeenCalled()
    expect(realpath).not.toHaveBeenCalled()
  })
})

describe('resolveTracePath file', () => {
  const file = (p: string): { kind: 'file'; path: string } => ({ kind: 'file', path: p })

  it('accepts any absolute regular file, and a symlink to one as its real path', async () => {
    const outside = path.join(root, 'outside.zip')
    expect(await resolveTracePath(file(outside))).toBe(outside)
    expect(await resolveTracePath(file(path.join(root, 'outside-link.zip')))).toBe(outside)
  })

  it('refuses a directory, a relative path, a missing file, a NUL path and a UNC path', async () => {
    const realpath = vi.spyOn(fs.promises, 'realpath')
    expect(await resolveTracePath(file('outside.zip'))).toBeNull()
    expect(await resolveTracePath(file(`${zip}\0`))).toBeNull()
    expect(await resolveTracePath(file('\\\\host\\share\\x.zip'), 'win32')).toBeNull()
    expect(await resolveTracePath(file('//host/share/x.zip'))).toBeNull()
    expect(realpath).not.toHaveBeenCalled()
    expect(await resolveTracePath(file(attachments))).toBeNull()
    expect(await resolveTracePath(file(path.join(root, 'missing.zip')))).toBeNull()
  })
})

describe('openTrace', () => {
  it('validates its argument', async () => {
    const bad: unknown[] = [
      null,
      undefined,
      'x',
      { kind: 'x' },
      { kind: 'file', path: 3 },
      { kind: 'result' },
      { kind: 'result', path: path.join(root, 'outside.zip') }
    ]
    for (const source of bad)
      expect(await openTrace(source)).toEqual({ ok: false, error: 'notFound' })
  })

  it('opens a dropped fixture twice, and a result trace', async () => {
    const first = await openTrace({ kind: 'file', path: path.join(root, 'outside.zip') })
    const second = await openTrace({ kind: 'file', path: path.join(root, 'outside.zip') })
    expect(first.ok && second.ok).toBe(true)
    expect(await openTrace({ kind: 'result', path: zip })).toMatchObject({ ok: true })
  })

  it('never returns a path to the renderer', async () => {
    const result = await openTrace({ kind: 'file', path: path.join(root, 'outside.zip') })
    expect(JSON.stringify(result)).not.toContain(root)
  })
})

describe('openTraceFromDialog', () => {
  const makeWin = (): { win: BrowserWindow; send: ReturnType<typeof vi.fn> } => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow
    return { win, send }
  }

  it('sends trace-opened with the opened trace', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [FIXTURE] })
    const { win, send } = makeWin()
    await openTraceFromDialog(win)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('trace-opened')
    expect(send.mock.calls[0][1]).toMatchObject({ ok: true })
    expect(vi.mocked(dialog.showOpenDialog).mock.calls[0][1]).toMatchObject({
      title: 'Open a trace'
    })
  })

  it('uses the English copy for the title and filter', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    await openTraceFromDialog(makeWin().win)
    const options = vi.mocked(dialog.showOpenDialog).mock.calls[0][1]
    expect(options.title).toBe(en.traceViewer.dialogTitle)
    expect(options.filters).toEqual([{ name: en.traceViewer.dialogFilter, extensions: ['zip'] }])
  })

  it('sends damaged when the dialog fails', async () => {
    vi.mocked(dialog.showOpenDialog).mockRejectedValue(new Error('no dialog'))
    const { win, send } = makeWin()
    await expect(openTraceFromDialog(win)).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledWith('trace-opened', { ok: false, error: 'damaged' })
  })

  it('sends nothing when cancelled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const { win, send } = makeWin()
    await openTraceFromDialog(win)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('registerTraceIpc', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  beforeAll(() => {
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)
    } as unknown as IpcMain
    registerTraceIpc(ipcMain)
  })

  it('registers trace-open, trace-entry and trace-close', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'trace-close',
      'trace-entry',
      'trace-open',
      'trace-open-drop'
    ])
  })

  it('trace-open takes only run.json traces; a file path is refused', async () => {
    const open = handlers.get('trace-open')!
    const outside = path.join(root, 'outside.zip')
    expect(await open({}, { kind: 'file', path: outside })).toEqual({
      ok: false,
      error: 'notFound'
    })
    expect(await open({}, { kind: 'result', path: outside })).toEqual({
      ok: false,
      error: 'notFound'
    })
    expect(await open({}, null)).toEqual({ ok: false, error: 'notFound' })
  })

  describe('trace-open-drop', () => {
    let home: string
    const savedHome = process.env.HOME
    beforeAll(() => {
      home = path.join(root, 'home')
      fs.mkdirSync(path.join(home, 'Downloads'), { recursive: true })
      fs.copyFileSync(FIXTURE, path.join(home, 'Downloads', 'trace.ZIP'))
      fs.copyFileSync(FIXTURE, path.join(home, 'Downloads', 'trace.bin'))
      fs.symlinkSync(path.join(root, 'outside.zip'), path.join(home, 'Downloads', 'link.zip'))
    })
    beforeEach(() => {
      // Only HOME is allowed: no temp or userData root to fall back on.
      process.env.HOME = home
      vi.spyOn(os, 'tmpdir').mockReturnValue('/nonexistent-tmp')
    })
    afterEach(() => {
      process.env.HOME = savedHome
    })

    it('opens a real drop inside home (.zip in any case)', async () => {
      const drop = handlers.get('trace-open-drop')!
      expect(await drop({}, path.join(home, 'Downloads', 'trace.ZIP'))).toMatchObject({ ok: true })
    })

    it('refuses a forged path outside the allowed roots without touching it', async () => {
      const drop = handlers.get('trace-open-drop')!
      const realpath = vi.spyOn(fs.promises, 'realpath')
      expect(await drop({}, path.join(root, 'outside.zip'))).toEqual({
        ok: false,
        error: 'notFound'
      })
      expect(await drop({}, '/etc/x.zip')).toEqual({ ok: false, error: 'notFound' })
      expect(await drop({}, `${home}/../outside.zip`)).toEqual({ ok: false, error: 'notFound' })
      expect(realpath).not.toHaveBeenCalled()
    })

    it('refuses a link in home whose real path leaves the allowed roots', async () => {
      const drop = handlers.get('trace-open-drop')!
      expect(await drop({}, path.join(home, 'Downloads', 'link.zip'))).toEqual({
        ok: false,
        error: 'notFound'
      })
    })

    it('says a dropped folder is not a trace, and a missing file is not found', async () => {
      const drop = handlers.get('trace-open-drop')!
      fs.mkdirSync(path.join(home, 'Downloads', 'folder.zip'), { recursive: true })
      expect(await drop({}, path.join(home, 'Downloads', 'folder.zip'))).toEqual({
        ok: false,
        error: 'notTrace'
      })
      expect(await drop({}, path.join(home, 'Downloads', 'missing.zip'))).toEqual({
        ok: false,
        error: 'notFound'
      })
    })

    it('refuses a non-.zip file and invalid arguments', async () => {
      const drop = handlers.get('trace-open-drop')!
      const bad = [
        path.join(home, 'Downloads', 'trace.bin'),
        '',
        3,
        null,
        { kind: 'file', path: zip },
        'relative.zip'
      ]
      for (const arg of bad) expect(await drop({}, arg)).toEqual({ ok: false, error: 'notFound' })
    })
  })

  it('validates trace-entry and trace-close arguments', async () => {
    const entry = handlers.get('trace-entry')!
    const close = handlers.get('trace-close')!
    expect(await entry({}, 3, 'steps/0001.jpg')).toEqual({ ok: false, error: 'closed' })
    expect(await entry({}, 'id', { name: 'x' })).toEqual({ ok: false, error: 'notCaptured' })
    expect(await close({}, 42)).toBeUndefined()
  })

  it('opens, reads lazily by id, then closes', async () => {
    const opened = (await handlers.get('trace-open')!({}, { kind: 'result', path: zip })) as {
      ok: true
      traceId: string
    }
    expect(opened.ok).toBe(true)
    const entry = handlers.get('trace-entry')!
    expect(await entry({}, opened.traceId, 'steps/0001.jpg')).toMatchObject({
      ok: true,
      kind: 'image'
    })
    await handlers.get('trace-close')!({}, opened.traceId)
    expect(await entry({}, opened.traceId, 'steps/0001.jpg')).toEqual({
      ok: false,
      error: 'closed'
    })
  })

  it('maps an fs failure to notFound instead of throwing', async () => {
    vi.spyOn(fs.promises, 'realpath').mockRejectedValueOnce(new Error('boom'))
    expect(await handlers.get('trace-open')!({}, { kind: 'file', path: zip })).toEqual({
      ok: false,
      error: 'notFound'
    })
  })
})
