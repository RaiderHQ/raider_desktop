// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }
}))

import {
  resolveMediaPath,
  parseRange,
  handleMediaRequest,
  registerMediaScheme,
  registerMediaHandler
} from '../../src/main/handlers/media/mediaProtocol'
import { protocol } from 'electron'

const url = (p: string): string => `raider-media://file/${encodeURIComponent(p)}`

let root: string
let clip: string
const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz') // 36 bytes

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'media-')))
  const dir = path.join(root, 'raider-results', 'attachments')
  fs.mkdirSync(dir, { recursive: true })
  clip = path.join(dir, 'clip.webm')
  fs.writeFileSync(clip, bytes)
  fs.writeFileSync(path.join(dir, 'clip.mp4'), bytes)
  fs.writeFileSync(path.join(dir, 'clip.mov'), bytes)
  fs.writeFileSync(path.join(dir, 'page.html'), 'x')
  fs.writeFileSync(path.join(dir, 'shot.png'), 'x')
  const shard = path.join(root, 'raider-results', 'attachments-2')
  fs.mkdirSync(shard, { recursive: true })
  fs.writeFileSync(path.join(shard, 'clip.webm'), bytes)
  const other = path.join(root, 'elsewhere', 'attachments')
  fs.mkdirSync(other, { recursive: true })
  fs.writeFileSync(path.join(other, 'clip.webm'), bytes)
  // symlinks
  const real = path.join(root, 'real-attachments')
  fs.mkdirSync(real, { recursive: true })
  fs.writeFileSync(path.join(real, 'clip.webm'), bytes)
  fs.mkdirSync(path.join(dir, 'x'))
  fs.writeFileSync(path.join(dir, 'x', 'clip.webm'), bytes)
  const twice = path.join(root, 'raider-results', 'raider-results', 'attachments')
  fs.mkdirSync(twice, { recursive: true })
  fs.writeFileSync(path.join(twice, 'clip.webm'), bytes)
  fs.symlinkSync(real, path.join(root, 'raider-results', 'attachments-3'))
  fs.symlinkSync(clip, path.join(dir, 'link.webm'))
})

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

describe('resolveMediaPath', () => {
  it('resolves a video under raider-results/attachments', async () => {
    expect(await resolveMediaPath(url(clip))).toBe(clip)
    expect(await resolveMediaPath(url(clip.replace('.webm', '.mp4')))).toBe(
      clip.replace('.webm', '.mp4')
    )
    expect(await resolveMediaPath(url(clip.replace('.webm', '.mov')))).toBe(
      clip.replace('.webm', '.mov')
    )
  })

  it('resolves under attachments-2 (shards)', async () => {
    const p = path.join(root, 'raider-results', 'attachments-2', 'clip.webm')
    expect(await resolveMediaPath(url(p))).toBe(p)
  })

  it('rejects ../ escapes, relative paths, other hosts, .html/.png, missing files', async () => {
    const dir = path.dirname(clip)
    expect(await resolveMediaPath(url(`${dir}/../../../real-attachments/clip.webm`))).toBeNull()
    expect(await resolveMediaPath(url('raider-results/attachments/clip.webm'))).toBeNull()
    expect(await resolveMediaPath(`raider-media://other/${encodeURIComponent(clip)}`)).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'page.html')))).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'shot.png')))).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'nope.webm')))).toBeNull()
    expect(await resolveMediaPath(url(dir))).toBeNull()
    expect(await resolveMediaPath('not a url')).toBeNull()
    expect(await resolveMediaPath('raider-media://file/%E0%A4%A')).toBeNull()
  })

  it('rejects an attachments dir that links outside a raider-results/attachments real path', async () => {
    const viaDir = path.join(root, 'raider-results', 'attachments-3', 'clip.webm')
    expect(fs.existsSync(viaDir)).toBe(true)
    expect(await resolveMediaPath(url(viaDir))).toBeNull()
  })

  it('rejects a symlinked file, even one pointing at a valid video', async () => {
    expect(await resolveMediaPath(url(path.join(path.dirname(clip), 'link.webm')))).toBeNull()
  })

  it('rejects a link into attachments from a path without the attachments shape', async () => {
    const holder = fs.mkdtempSync(path.join(root, 'shape-'))
    fs.symlinkSync(path.dirname(clip), path.join(holder, 'videos'))
    expect(await resolveMediaPath(url(path.join(holder, 'videos', 'clip.webm')))).toBeNull()
  })

  it('rejects a file outside raider-results even if named attachments', async () => {
    expect(
      await resolveMediaPath(url(path.join(root, 'elsewhere', 'attachments', 'clip.webm')))
    ).toBeNull()
  })

  it('resolves a project under a symlinked ancestor (e.g. macOS /var -> /private/var) to the real path', async () => {
    const holder = fs.mkdtempSync(path.join(root, 'holder-'))
    const linkRoot = path.join(holder, 'link')
    fs.symlinkSync(root, linkRoot)
    const viaAncestor = path.join(linkRoot, 'raider-results', 'attachments', 'clip.webm')
    expect(fs.existsSync(viaAncestor)).toBe(true)
    expect(await resolveMediaPath(url(viaAncestor))).toBe(clip)
  })

  it('resolves an un-realpathed os.tmpdir() project', async () => {
    const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'media-raw-'))
    try {
      const dir = path.join(raw, 'raider-results', 'attachments')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'clip.webm'), bytes)
      expect(await resolveMediaPath(url(path.join(dir, 'clip.webm')))).toBe(
        fs.realpathSync(path.join(dir, 'clip.webm'))
      )
    } finally {
      fs.rmSync(raw, { recursive: true, force: true })
    }
  })

  it('serves a project under a symlinked ancestor but not a symlinked file', async () => {
    const holder = fs.mkdtempSync(path.join(root, 'serve-'))
    fs.symlinkSync(root, path.join(holder, 'link'))
    const ok = await handleMediaRequest(
      new Request(url(path.join(holder, 'link', 'raider-results', 'attachments', 'clip.webm')))
    )
    expect(ok.status).toBe(200)
    expect(Buffer.from(await ok.arrayBuffer()).equals(bytes)).toBe(true)
    const bad = await handleMediaRequest(
      new Request(url(path.join(path.dirname(clip), 'link.webm')))
    )
    expect(bad.status).toBe(404)
  })
})

describe('resolveMediaPath escape vectors', () => {
  const dir = (): string => path.dirname(clip)
  const rawUrl = (encodedPath: string): string => `raider-media://file/${encodedPath}`

  it('rejects a nested file below attachments', async () => {
    expect(await resolveMediaPath(url(path.join(dir(), 'x', 'clip.webm')))).toBeNull()
  })
  it('rejects encoded %2e%2e segments', async () => {
    const enc = encodeURIComponent(dir()) + '%2F%2e%2e%2Fattachments%2Fclip.webm'
    expect(await resolveMediaPath(rawUrl(enc))).toBeNull()
  })
  it('rejects backslash ..', async () => {
    expect(await resolveMediaPath(url(`${dir()}\\..\\attachments\\clip.webm`))).toBeNull()
  })
  it('rejects a NUL byte', async () => {
    expect(await resolveMediaPath(url(`${clip}\0.webm`))).toBeNull()
    expect(await resolveMediaPath(url(`${dir()}/clip.webm\0`))).toBeNull()
  })
  it('rejects a trailing slash', async () => {
    expect(await resolveMediaPath(url(`${clip}/`))).toBeNull()
  })
  it('rejects double encoding', async () => {
    expect(await resolveMediaPath(rawUrl(encodeURIComponent(encodeURIComponent(clip))))).toBeNull()
  })
  it('rejects raider-results appearing twice', async () => {
    const p = path.join(root, 'raider-results', 'raider-results', 'attachments', 'clip.webm')
    expect(fs.existsSync(p)).toBe(true)
    expect(await resolveMediaPath(url(p))).toBeNull()
  })
  it('rejects UNC paths before any fs call', async () => {
    const realpath = vi.spyOn(fs.promises, 'realpath')
    const lstat = vi.spyOn(fs.promises, 'lstat')
    const unc = [
      '\\\\evil\\s\\raider-results\\attachments\\a.webm',
      '//evil/s/raider-results/attachments/a.webm'
    ]
    for (const platform of ['win32', 'linux'] as const) {
      for (const p of unc) expect(await resolveMediaPath(url(p), platform)).toBeNull()
    }
    expect(await resolveMediaPath(url('/raider-results/attachments/a.webm'), 'win32')).toBeNull()
    expect(realpath).not.toHaveBeenCalled()
    expect(lstat).not.toHaveBeenCalled()
  })
  it('positive control: the realpath spy fires on a valid path', async () => {
    const realpath = vi.spyOn(fs.promises, 'realpath')
    expect(await resolveMediaPath(url(clip))).toBe(clip)
    expect(realpath).toHaveBeenCalledTimes(1)
  })
  it('on win32 requires a drive-letter root', async () => {
    const realpath = vi.spyOn(fs.promises, 'realpath')
    expect(await resolveMediaPath(url('\\raider-results\\attachments\\a.webm'), 'win32')).toBeNull()
    expect(realpath).not.toHaveBeenCalled()
  })
})

describe('parseRange', () => {
  const r = (start: number, end: number): object => ({ kind: 'range', start, end })
  it('parses open, bounded and suffix ranges', () => {
    expect(parseRange('bytes=0-', 100)).toEqual(r(0, 99))
    expect(parseRange('bytes=10-19', 100)).toEqual(r(10, 19))
    expect(parseRange('bytes=-5', 100)).toEqual(r(95, 99))
  })
  it('clamps an end past the file size and an oversized suffix', () => {
    expect(parseRange('bytes=90-500', 100)).toEqual(r(90, 99))
    expect(parseRange('bytes=-500', 100)).toEqual(r(0, 99))
  })
  it('is unsatisfiable for well-formed ranges outside the file', () => {
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=200-300', 100)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' })
  })
  it('ignores invalid, multi-range, unsupported-unit or absent headers', () => {
    for (const h of ['bytes=20-10', 'bytes=abc', 'bytes=0-1,5-6', 'items=0-1', 'bytes=-', null]) {
      expect(parseRange(h, 100)).toEqual({ kind: 'none' })
    }
  })
})

describe('handleMediaRequest', () => {
  const req = (p: string, init: RequestInit = {}): Request => new Request(url(p), init)

  it('200 serves the whole file with type and length', async () => {
    const res = await handleMediaRequest(req(clip))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/webm')
    expect(res.headers.get('Content-Length')).toBe(String(bytes.length))
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true)
  })

  it('sets Content-Type by extension', async () => {
    const mp4 = await handleMediaRequest(req(clip.replace('.webm', '.mp4')))
    const mov = await handleMediaRequest(req(clip.replace('.webm', '.mov')))
    expect(mp4.headers.get('Content-Type')).toBe('video/mp4')
    expect(mov.headers.get('Content-Type')).toBe('video/quicktime')
    await mp4.body?.cancel()
    await mov.body?.cancel()
  })

  it('206 serves a byte slice with Content-Range', async () => {
    const res = await handleMediaRequest(req(clip, { headers: { Range: 'bytes=10-19' } }))
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/36')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe('10')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('abcdefghij')
  })

  it('404 for a path that fails the checks', async () => {
    const res = await handleMediaRequest(
      req(path.join(root, 'elsewhere', 'attachments', 'clip.webm'))
    )
    expect(res.status).toBe(404)
  })

  it('200 whole file when the Range header is malformed or multi-range', async () => {
    for (const h of ['bytes=5-2', 'bytes=0-1,5-6', 'garbage']) {
      const res = await handleMediaRequest(req(clip, { headers: { Range: h } }))
      expect(res.status).toBe(200)
      expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true)
    }
  })

  it('206 serves a suffix range', async () => {
    const res = await handleMediaRequest(req(clip, { headers: { Range: 'bytes=-5' } }))
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 31-35/36')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('vwxyz')
  })

  it('HEAD with a Range returns 206 headers only', async () => {
    const res = await handleMediaRequest(
      req(clip, { method: 'HEAD', headers: { Range: 'bytes=10-19' } })
    )
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/36')
    expect(res.headers.get('Content-Length')).toBe('10')
    expect((await res.arrayBuffer()).byteLength).toBe(0)
  })

  it('416 for an unsatisfiable range', async () => {
    const res = await handleMediaRequest(req(clip, { headers: { Range: 'bytes=500-' } }))
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */36')
  })

  it('404 and closes the handle when stat throws', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'open').mockResolvedValue({
      stat: vi.fn().mockRejectedValue(new Error('EIO')),
      close
    } as unknown as fs.promises.FileHandle)
    const res = await handleMediaRequest(req(clip))
    expect(res.status).toBe(404)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('opens with O_NONBLOCK so a swapped-in FIFO cannot block', async () => {
    const open = vi.spyOn(fs.promises, 'open')
    const res = await handleMediaRequest(req(clip))
    await res.body?.cancel()
    expect((open.mock.calls[0][1] as number) & fs.constants.O_NONBLOCK).toBe(
      fs.constants.O_NONBLOCK
    )
  })

  it('405 for methods other than GET/HEAD', async () => {
    const res = await handleMediaRequest(req(clip, { method: 'POST', body: 'x' }))
    expect(res.status).toBe(405)
  })

  it('HEAD returns headers only', async () => {
    const res = await handleMediaRequest(req(clip, { method: 'HEAD' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Length')).toBe('36')
    expect((await res.arrayBuffer()).byteLength).toBe(0)
  })
})

describe('registration', () => {
  it('registers a privileged streaming scheme and a handler', () => {
    registerMediaScheme()
    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      { scheme: 'raider-media', privileges: { stream: true, supportFetchAPI: true } }
    ])
    registerMediaHandler()
    expect(protocol.handle).toHaveBeenCalledWith('raider-media', handleMediaRequest)
  })
})
