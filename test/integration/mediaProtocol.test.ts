// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
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
  const dir = path.join(root, 'raider-results', 'attachments', 'x')
  fs.mkdirSync(dir, { recursive: true })
  clip = path.join(dir, 'clip.webm')
  fs.writeFileSync(clip, bytes)
  fs.writeFileSync(path.join(dir, 'clip.mp4'), bytes)
  fs.writeFileSync(path.join(dir, 'clip.mov'), bytes)
  fs.writeFileSync(path.join(dir, 'page.html'), 'x')
  fs.writeFileSync(path.join(dir, 'shot.png'), 'x')
  const shard = path.join(root, 'raider-results', 'attachments-2', 'y')
  fs.mkdirSync(shard, { recursive: true })
  fs.writeFileSync(path.join(shard, 'clip.webm'), bytes)
  const other = path.join(root, 'elsewhere', 'attachments', 'x')
  fs.mkdirSync(other, { recursive: true })
  fs.writeFileSync(path.join(other, 'clip.webm'), bytes)
  // symlinks
  const real = path.join(root, 'real-attachments')
  fs.mkdirSync(path.join(real, 'x'), { recursive: true })
  fs.writeFileSync(path.join(real, 'x', 'clip.webm'), bytes)
  fs.symlinkSync(real, path.join(root, 'raider-results', 'attachments-3'))
  fs.symlinkSync(clip, path.join(dir, 'link.webm'))
})

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

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
    const p = path.join(root, 'raider-results', 'attachments-2', 'y', 'clip.webm')
    expect(await resolveMediaPath(url(p))).toBe(p)
  })

  it('rejects ../ escapes, relative paths, other hosts, .html/.png, missing files', async () => {
    const dir = path.dirname(clip)
    expect(
      await resolveMediaPath(url(`${dir}/../../../../real-attachments/x/clip.webm`))
    ).toBeNull()
    expect(await resolveMediaPath(url('raider-results/attachments/x/clip.webm'))).toBeNull()
    expect(await resolveMediaPath(`raider-media://other/${encodeURIComponent(clip)}`)).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'page.html')))).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'shot.png')))).toBeNull()
    expect(await resolveMediaPath(url(path.join(dir, 'nope.webm')))).toBeNull()
    expect(await resolveMediaPath(url(dir))).toBeNull()
    expect(await resolveMediaPath('not a url')).toBeNull()
    expect(await resolveMediaPath('raider-media://file/%E0%A4%A')).toBeNull()
  })

  it('rejects a symlinked attachments dir and a symlinked file', async () => {
    const viaDir = path.join(root, 'raider-results', 'attachments-3', 'x', 'clip.webm')
    expect(await resolveMediaPath(url(viaDir))).toBeNull()
    expect(await resolveMediaPath(url(path.join(path.dirname(clip), 'link.webm')))).toBeNull()
  })

  it('rejects a file outside raider-results even if named attachments', async () => {
    expect(
      await resolveMediaPath(url(path.join(root, 'elsewhere', 'attachments', 'x', 'clip.webm')))
    ).toBeNull()
  })

  it('rejects a path with a symlinked ancestor (e.g. macOS /var -> /private/var)', async () => {
    const holder = fs.mkdtempSync(path.join(root, 'holder-'))
    const linkRoot = path.join(holder, 'link')
    fs.symlinkSync(root, linkRoot)
    const viaAncestor = path.join(linkRoot, 'raider-results', 'attachments', 'x', 'clip.webm')
    expect(fs.existsSync(viaAncestor)).toBe(true)
    expect(await resolveMediaPath(url(viaAncestor))).toBeNull()
  })
})

describe('parseRange', () => {
  it('parses open, bounded and suffix ranges', () => {
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=-5', 100)).toEqual({ start: 95, end: 99 })
  })
  it('clamps an end past the file size', () => {
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  })
  it('returns null for unsatisfiable or garbage ranges', () => {
    expect(parseRange('bytes=100-', 100)).toBeNull()
    expect(parseRange('bytes=200-300', 100)).toBeNull()
    expect(parseRange('bytes=20-10', 100)).toBeNull()
    expect(parseRange('bytes=-0', 100)).toBeNull()
    expect(parseRange('bytes=abc', 100)).toBeNull()
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-', 0)).toBeNull()
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
      req(path.join(root, 'elsewhere', 'attachments', 'x', 'clip.webm'))
    )
    expect(res.status).toBe(404)
  })

  it('416 for an unsatisfiable range', async () => {
    const res = await handleMediaRequest(req(clip, { headers: { Range: 'bytes=500-' } }))
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */36')
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
