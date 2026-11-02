// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { makeZip } from '../../helpers/makeZip'

vi.mock('zlib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zlib')>()
  const inflateRawSync = vi.fn(actual.inflateRawSync)
  return { ...actual, inflateRawSync, default: { ...actual, inflateRawSync } }
})

import zlib from 'zlib'
import {
  readZipDirectory,
  readZipEntry,
  ZipRefused,
  TRACE_ZIP_LIMITS
} from '../../../src/main/handlers/trace/zipReader'

const fixture = readFileSync(join(__dirname, '../../fixtures/trace-v1/trace.zip'))

const refusedWith = (reason: string): unknown => expect.objectContaining({ reason })

// The central directory offset, read from an EOCD with no comment.
const centralOffset = (zip: Buffer): number => zip.readUInt32LE(zip.length - 6)

describe('readZipDirectory and readZipEntry', () => {
  beforeEach(() => {
    vi.mocked(zlib.inflateRawSync).mockClear()
  })

  it('reads the fixture', () => {
    const entries = readZipDirectory(fixture)
    expect(entries.size).toBe(11)

    const json = readZipEntry(fixture, entries.get('trace.json')!)
    expect(json.length).toBe(6231)
    expect(JSON.parse(json.toString('utf8')).format).toBe('raider-trace')

    const jpg = entries.get('steps/0002.jpg')!
    expect(jpg.method).toBe(0)
    const image = readZipEntry(fixture, jpg)
    expect(image.length).toBe(15296)
    expect([image[0], image[1]]).toEqual([0xff, 0xd8])
  })

  it('refuses a buffer over maxZipBytes', () => {
    expect(() => readZipDirectory(fixture, { ...TRACE_ZIP_LIMITS, maxZipBytes: 1000 })).toThrowError(
      refusedWith('tooLarge')
    )
  })

  it('refuses more entries than maxEntries', () => {
    const entries = Array.from({ length: 402 }, (_, i) => ({
      name: `steps/${String(i + 1).padStart(4, '0')}.html`,
      data: 'x'
    }))
    expect(() => readZipDirectory(makeZip(entries))).toThrowError(refusedWith('tooLarge'))
  })

  it('refuses a total uncompressed size over maxTotalBytes', () => {
    const zip = makeZip([
      { name: 'trace.json', data: '{}', method: 8, declaredSize: 60 },
      { name: 'steps/0001.html', data: 'x', method: 8, declaredSize: 60 }
    ])
    expect(() => readZipDirectory(zip, { ...TRACE_ZIP_LIMITS, maxTotalBytes: 100 })).toThrowError(
      refusedWith('tooLarge')
    )
  })

  it('refuses an entry over maxEntryBytes', () => {
    const zip = makeZip([{ name: 'trace.json', data: 'x'.repeat(100) }])
    expect(() => readZipDirectory(zip, { ...TRACE_ZIP_LIMITS, maxEntryBytes: 10 })).toThrowError(
      refusedWith('tooLarge')
    )
  })

  it('refuses an extreme compression ratio', () => {
    const zip = makeZip([{ name: 'trace.json', data: Buffer.alloc(2 * 1024 * 1024), method: 8 }])
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it.each([
    '../trace.json',
    '/trace.json',
    'steps\\0001.jpg',
    'steps/',
    '__MACOSX/._trace.json',
    'steps/1.jpg',
    'steps/0001.gif',
    'steps/sub/0001.jpg',
    'trace.JSON',
    'stéps/0001.jpg'
  ])('refuses the entry name %s', (name) => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }, { name, data: 'x' }])
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('refuses a symlink entry', () => {
    const zip = makeZip([{ name: 'steps/0001.html', data: '/etc/passwd', unixMode: 0o120777 }])
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('accepts a regular Unix file', () => {
    const zip = makeZip([{ name: 'steps/0001.html', data: '<p>hi</p>', unixMode: 0o100644 }])
    const entry = readZipDirectory(zip).get('steps/0001.html')!
    expect(readZipEntry(zip, entry).toString()).toBe('<p>hi</p>')
  })

  it('refuses an encrypted entry', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{}', flags: 1 }])
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('refuses method 12', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }])
    zip.writeUInt16LE(12, 8)
    zip.writeUInt16LE(12, centralOffset(zip) + 10)
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('refuses duplicate names', () => {
    const zip = makeZip([
      { name: 'trace.json', data: '{}' },
      { name: 'trace.json', data: '{"a":1}' }
    ])
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('refuses zip64 markers', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }])
    zip.writeUInt16LE(0xffff, zip.length - 12)
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('refuses zip64 sizes in a central directory record', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }])
    zip.writeUInt32LE(0xffffffff, centralOffset(zip) + 20)
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it('says notTrace for a non-zip', () => {
    expect(() => readZipDirectory(Buffer.from('%PDF-1.4'))).toThrowError(refusedWith('notTrace'))
  })

  it('says notTrace for an empty buffer', () => {
    expect(() => readZipDirectory(Buffer.alloc(0))).toThrowError(refusedWith('notTrace'))
  })

  it.each([10, 9000])('says damaged when the declared size lies (%i)', (declaredSize) => {
    const data = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 251))
    const zip = makeZip([{ name: 'trace.json', data, method: 8, declaredSize }])
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it('says damaged when a local header name differs from the central directory', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }])
    zip.write('X', 30)
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it('says damaged when a local header method differs from the central directory', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}', method: 8 }])
    zip.writeUInt16LE(0, 8)
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it('says damaged when local header sizes differ from the central directory', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}' }])
    zip.writeUInt32LE(3, 18)
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it('says damaged when an entry runs into the central directory', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}' }])
    zip.writeUInt32LE(4000, centralOffset(zip) + 20)
    zip.writeUInt32LE(4000, centralOffset(zip) + 24)
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('damaged'))
  })

  it('reads a zero-length entry', () => {
    const zip = makeZip([{ name: 'steps/0001.html', data: '', method: 8 }])
    const entry = readZipDirectory(zip).get('steps/0001.html')!
    const data = readZipEntry(zip, entry)
    expect(data.length).toBe(0)
    expect(zlib.inflateRawSync).not.toHaveBeenCalled()
  })

  it('only ever refuses with a typed reason on truncated or flipped bytes', () => {
    // mulberry32, seeded so a failure reproduces.
    let seed = 0x5eed
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = (n: number): number => Math.floor(random() * n)
    const tail = centralOffset(fixture)

    for (let i = 0; i < 600; i++) {
      let mutant = Buffer.from(fixture)
      const kind = i % 3
      if (kind !== 1) mutant = mutant.subarray(0, pick(mutant.length + 1))
      if (kind !== 0 && mutant.length > 0) {
        const flips = 1 + pick(8)
        for (let f = 0; f < flips; f++) {
          // Half the flips land in the central directory and EOCD, where they matter most.
          const at = random() < 0.5 ? pick(mutant.length) : tail + pick(mutant.length - tail)
          if (at < mutant.length) mutant[at] ^= 1 + pick(255)
        }
      }

      try {
        const entries = readZipDirectory(mutant)
        for (const entry of entries.values()) {
          try {
            readZipEntry(mutant, entry)
          } catch (error) {
            expect(error).toBeInstanceOf(ZipRefused)
          }
        }
      } catch (error) {
        expect(error).toBeInstanceOf(ZipRefused)
      }
    }
  }, 10_000)
})
