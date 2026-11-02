// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { makeZip } from '../../helpers/makeZip'
import { TRACE_ZIP_LIMITS } from '../../../src/main/handlers/trace/zipReader'
import {
  openTraceFile,
  readTraceEntry,
  closeTrace,
  MAX_OPEN_TRACES
} from '../../../src/main/handlers/trace/traceArchive'

const FIXTURE = path.join(__dirname, '../../fixtures/trace-v1/trace.zip')

let root: string
let fixture: string

const traceJson = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: 'raider-trace', version: 1, steps: [], ...extra })

const writeZip = (name: string, entries: Parameters<typeof makeZip>[0]): string => {
  const p = path.join(root, name)
  fs.writeFileSync(p, makeZip(entries))
  return p
}

const opened = async (p: string): Promise<string> => {
  const result = await openTraceFile(p)
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`)
  return result.traceId
}

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-archive-')))
  fixture = path.join(root, 'trace.zip')
  fs.copyFileSync(FIXTURE, fixture)
})

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

describe('openTraceFile and readTraceEntry', () => {
  it('opens one trace at a time; a second open waits for the first', async () => {
    const realOpen = fs.promises.open.bind(fs.promises)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const open = vi.spyOn(fs.promises, 'open')
    open.mockImplementationOnce(async (...args: Parameters<typeof realOpen>) => {
      await gate
      return realOpen(...args)
    })
    const second = writeZip('queued.zip', [{ name: 'trace.json', data: traceJson() }])
    const a = openTraceFile(fixture)
    const b = openTraceFile(second)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(open).toHaveBeenCalledTimes(1)
    release()
    expect(await a).toMatchObject({ ok: true })
    expect(await b).toMatchObject({ ok: true })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('opens the fixture', async () => {
    const result = await openTraceFile(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(result.index.steps.length).toBe(10)

    const image = readTraceEntry(result.traceId, 'steps/0002.jpg')
    expect(image).toMatchObject({ ok: true, kind: 'image' })
    if (image.ok && image.kind === 'image') {
      expect(image.dataUrl.startsWith('data:image/jpeg;base64,/9j/')).toBe(true)
    }

    const html = readTraceEntry(result.traceId, 'steps/0002.html')
    expect(html).toMatchObject({ ok: true, kind: 'html' })
    if (html.ok && html.kind !== 'image') expect(html.text).toContain('<h1 id="title">Trace</h1>')
  })

  it('serves a .png as an image and a .xml as text', async () => {
    const steps = [
      { index: 1, action: 'click', screenshot: 'steps/0001.png', snapshot: 'steps/0001.xml' }
    ]
    const p = writeZip('png-xml.zip', [
      { name: 'trace.json', data: traceJson({ steps }) },
      { name: 'steps/0001.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { name: 'steps/0001.xml', data: '<hierarchy/>' }
    ])
    const id = await opened(p)
    expect(readTraceEntry(id, 'steps/0001.png')).toEqual({
      ok: true,
      kind: 'image',
      dataUrl: 'data:image/png;base64,iVBORw=='
    })
    expect(readTraceEntry(id, 'steps/0001.xml')).toEqual({
      ok: true,
      kind: 'xml',
      text: '<hierarchy/>'
    })
  })

  it('notCaptured for a name the index does not reference', async () => {
    const id = await opened(fixture)
    expect(readTraceEntry(id, 'trace.json')).toEqual({ ok: false, error: 'notCaptured' })
    expect(readTraceEntry(id, 'steps/0004.jpg')).toEqual({ ok: false, error: 'notCaptured' })
    expect(readTraceEntry(id, '../../etc/passwd')).toEqual({ ok: false, error: 'notCaptured' })
  })

  it('damaged when a referenced entry does not inflate', async () => {
    const steps = [{ index: 1, action: 'click', screenshot: null, snapshot: 'steps/0001.html' }]
    const zip = makeZip([
      { name: 'trace.json', data: traceJson({ steps }) },
      { name: 'steps/0001.html', data: '<p>hi</p>', method: 8 }
    ])
    // Corrupt the deflated data of the last local entry, leaving the headers intact.
    const central = zip.readUInt32LE(zip.length - 6)
    zip.fill(0xff, central - 4, central)
    const p = path.join(root, 'corrupt.zip')
    fs.writeFileSync(p, zip)
    const id = await opened(p)
    expect(readTraceEntry(id, 'steps/0001.html')).toEqual({ ok: false, error: 'damaged' })
  })

  it('closed after closeTrace and closed for an unknown id', async () => {
    const id = await opened(fixture)
    closeTrace(id)
    expect(readTraceEntry(id, 'steps/0002.jpg')).toEqual({ ok: false, error: 'closed' })
    expect(readTraceEntry('no-such-id', 'steps/0002.jpg')).toEqual({ ok: false, error: 'closed' })
    expect(() => closeTrace('no-such-id')).not.toThrow()
  })

  it('keeps at most MAX_OPEN_TRACES', async () => {
    expect(MAX_OPEN_TRACES).toBe(2)
    const paths = [1, 2, 3].map((n) =>
      writeZip(`many-${n}.zip`, [{ name: 'trace.json', data: traceJson() }])
    )
    const ids: string[] = []
    for (const p of paths) ids.push(await opened(p))
    expect(new Set(ids).size).toBe(3)
    expect(readTraceEntry(ids[0], 'steps/0001.jpg')).toEqual({ ok: false, error: 'closed' })
    expect(readTraceEntry(ids[1], 'steps/0001.jpg')).toEqual({ ok: false, error: 'notCaptured' })
    expect(readTraceEntry(ids[2], 'steps/0001.jpg')).toEqual({ ok: false, error: 'notCaptured' })
  })

  it('reopening the same file replaces the earlier open instead of keeping both', async () => {
    const other = await opened(writeZip('other.zip', [{ name: 'trace.json', data: traceJson() }]))
    const first = await opened(fixture)
    const second = await opened(fixture)
    expect(second).not.toBe(first)
    expect(readTraceEntry(first, 'steps/0002.jpg')).toEqual({ ok: false, error: 'closed' })
    expect(readTraceEntry(second, 'steps/0002.jpg')).toMatchObject({ ok: true })
    // The reopen did not evict the other trace.
    expect(readTraceEntry(other, 'steps/0001.jpg')).toEqual({ ok: false, error: 'notCaptured' })
  })
})

describe('openTraceFile refusals', () => {
  it('notFound when the opened file is not the one checked before the open', async () => {
    const realLstat = fs.promises.lstat.bind(fs.promises)
    vi.spyOn(fs.promises, 'lstat').mockImplementationOnce(async (p) => {
      const stat = await realLstat(p)
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1 })
    })
    expect(await openTraceFile(fixture)).toEqual({ ok: false, error: 'notFound' })
  })

  it('notFound when a folder on the path became a link after the checks', async () => {
    const realRealpath = fs.promises.realpath.bind(fs.promises)
    vi.spyOn(fs.promises, 'realpath').mockImplementationOnce(async (p) => {
      const real = await realRealpath(p as string)
      return path.join('/elsewhere', real)
    })
    expect(await openTraceFile(fixture)).toEqual({ ok: false, error: 'notFound' })
  })

  it('notFound when the file at the path changed after the open', async () => {
    const realLstat = fs.promises.lstat.bind(fs.promises)
    const lstat = vi.spyOn(fs.promises, 'lstat')
    lstat.mockImplementationOnce((p) => realLstat(p))
    lstat.mockImplementationOnce(async (p) => {
      const stat = await realLstat(p)
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1 })
    })
    expect(await openTraceFile(fixture)).toEqual({ ok: false, error: 'notFound' })
  })

  it('maps refusals', async () => {
    const cases: [string, Parameters<typeof makeZip>[0], string][] = [
      ['no-index.zip', [{ name: 'steps/0001.html', data: 'x' }], 'notTrace'],
      ['bad-json.zip', [{ name: 'trace.json', data: '{nope' }], 'damaged'],
      ['v2.zip', [{ name: 'trace.json', data: traceJson({ version: 2 }) }], 'newerVersion'],
      ['other.zip', [{ name: 'trace.json', data: JSON.stringify({ format: 'x' }) }], 'notTrace'],
      [
        'dotdot.zip',
        [
          { name: 'trace.json', data: traceJson() },
          { name: '../x', data: 'x' }
        ],
        'unsafe'
      ],
      // A Finder re-zip adds directory entries and __MACOSX/ files.
      [
        'finder.zip',
        [
          { name: 'steps/', data: '' },
          { name: 'trace.json', data: traceJson() }
        ],
        'unsafe'
      ],
      [
        'macosx.zip',
        [
          { name: 'trace.json', data: traceJson() },
          { name: '__MACOSX/._trace.json', data: 'x' }
        ],
        'unsafe'
      ]
    ]
    for (const [name, entries, error] of cases) {
      expect(await openTraceFile(writeZip(name, entries)), name).toEqual({ ok: false, error })
    }
    const notZip = path.join(root, 'not-a-zip.zip')
    fs.writeFileSync(notZip, 'hello')
    expect(await openTraceFile(notZip)).toEqual({ ok: false, error: 'notTrace' })
  })

  it('tooLarge for a file over maxZipBytes, refused from fstat before any read', async () => {
    const big = path.join(root, 'big.zip')
    fs.writeFileSync(big, '')
    fs.truncateSync(big, TRACE_ZIP_LIMITS.maxZipBytes + 1)

    const realOpen = fs.promises.open.bind(fs.promises)
    const reads: ReturnType<typeof vi.fn>[] = []
    const readFile = vi.spyOn(fs.promises, 'readFile')
    vi.spyOn(fs.promises, 'open').mockImplementation(
      async (...args: Parameters<typeof realOpen>) => {
        const handle = await realOpen(...args)
        reads.push(vi.spyOn(handle, 'read') as never, vi.spyOn(handle, 'readFile') as never)
        return handle
      }
    )

    expect(await openTraceFile(big)).toEqual({ ok: false, error: 'tooLarge' })
    expect(reads.length).toBe(2)
    for (const read of reads) expect(read).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('notFound for a missing file and a directory', async () => {
    expect(await openTraceFile(path.join(root, 'missing.zip'))).toEqual({
      ok: false,
      error: 'notFound'
    })
    const dir = path.join(root, 'a-dir.zip')
    fs.mkdirSync(dir)
    expect(await openTraceFile(dir)).toEqual({ ok: false, error: 'notFound' })
  })

  it('notFound for a symlink (opened without following it)', async () => {
    const link = path.join(root, 'link.zip')
    fs.symlinkSync(fixture, link)
    expect(await openTraceFile(link)).toEqual({ ok: false, error: 'notFound' })
  })

  it.skipIf(process.platform === 'win32')('notFound for a FIFO', async () => {
    const fifo = path.join(root, 'fifo.zip')
    execFileSync('mkfifo', [fifo])
    expect(await openTraceFile(fifo)).toEqual({ ok: false, error: 'notFound' })
  })
})
