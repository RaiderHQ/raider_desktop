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
  TRACE_ZIP_LIMITS,
  type ZipEntry
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
    expect(zlib.inflateRawSync).toHaveBeenCalledTimes(1)
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
    zip.writeUInt16LE(0xffff, zip.length - 14)
    zip.writeUInt16LE(0xffff, zip.length - 12)
    expect(() => readZipDirectory(zip)).toThrowError(refusedWith('unsafe'))
  })

  it.each([
    ['size', 10],
    ['offset', 6]
  ])('refuses a zip64 central directory %s in the EOCD', (_field, fromEnd) => {
    const zip = makeZip([{ name: 'trace.json', data: '{}' }])
    zip.writeUInt32LE(0xffffffff, zip.length - fromEnd)
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

  it('reads an entry whose sizes are deferred to a data descriptor', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}', method: 8, flags: 8, zeroLocalSizes: true }])
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(readZipEntry(zip, entry).toString()).toBe('{"a":1}')
  })

  it('says damaged when local sizes are zero without a data descriptor', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}', method: 8, zeroLocalSizes: true }])
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it.each([
    ['a data descriptor only locally', 8, 0],
    ['a data descriptor only centrally', 0, 8],
    ['strong encryption locally', 0x40, 0],
    ['a masked header locally', 0x2000, 0]
  ])('says damaged when the local header has %s', (_case, localFlags, flags) => {
    const zip = makeZip([
      { name: 'trace.json', data: '{"a":1}', method: 8, flags, localFlags, zeroLocalSizes: localFlags === 8 }
    ])
    const entry = readZipDirectory(zip).get('trace.json')!
    expect(() => readZipEntry(zip, entry)).toThrowError(refusedWith('damaged'))
  })

  it('says damaged when a local extra field pushes the data into the central directory', () => {
    const zip = makeZip([{ name: 'trace.json', data: '{"a":1}' }])
    zip.writeUInt16LE(4, 28)
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
    const cd = centralOffset(fixture)
    const eocd = fixture.length - 22
    const body = fixture.subarray(0, cd)
    const tail = fixture.subarray(cd)
    const localHeaders = [...readZipDirectory(fixture).values()].map((e) => e.localHeaderOffset)

    const flip = (mutant: Buffer, from: number, to: number): Buffer => {
      const flips = 1 + pick(8)
      for (let f = 0; f < flips; f++) mutant[from + pick(to - from)] ^= 1 + pick(255)
      return mutant
    }
    // Each kind keeps a valid EOCD at the end, so mutants get past the EOCD scan.
    const mutants: Array<() => Buffer> = [
      // Flipped entry headers and data.
      () => flip(Buffer.from(fixture), 0, cd),
      // Flipped local header fields, which only readZipEntry checks.
      () => {
        const at = localHeaders[pick(localHeaders.length)]
        return flip(Buffer.from(fixture), at, at + 30)
      },
      // Flipped central directory fields.
      () => flip(Buffer.from(fixture), cd, eocd),
      // Flipped EOCD fields.
      () => flip(Buffer.from(fixture), eocd, fixture.length),
      // A body cut short, with the directory re-appended and its offset patched.
      () => {
        const cut = pick(cd)
        const mutant = Buffer.concat([body.subarray(0, cut), tail])
        mutant.writeUInt32LE(cut, mutant.length - 6)
        return mutant
      },
      // A body cut at the front, with the directory re-appended and its offset patched.
      () => {
        const cut = pick(cd)
        const mutant = Buffer.concat([body.subarray(cut), tail])
        mutant.writeUInt32LE(cd - cut, mutant.length - 6)
        return mutant
      },
      // A cut body and flipped directory fields together.
      () => {
        const cut = pick(cd)
        const mutant = Buffer.concat([body.subarray(0, cut), tail])
        mutant.writeUInt32LE(cut, mutant.length - 6)
        return flip(mutant, cut, mutant.length)
      }
    ]

    let directoriesRead = 0
    let entriesRead = 0
    let entriesRefused = 0
    for (let i = 0; i < 900; i++) {
      const mutant = mutants[i % mutants.length]()
      let entries: Map<string, ZipEntry>
      try {
        entries = readZipDirectory(mutant)
      } catch (error) {
        expect(error).toBeInstanceOf(ZipRefused)
        continue
      }
      directoriesRead++
      for (const entry of entries.values()) {
        let data: Buffer | undefined
        try {
          data = readZipEntry(mutant, entry)
        } catch (error) {
          expect(error).toBeInstanceOf(ZipRefused)
          entriesRefused++
        }
        if (data) {
          expect(data.length).toBe(entry.size)
          entriesRead++
        }
      }
    }

    // Floors, so the test can't silently stop reaching the reader (seeded: 275, 2876, 149).
    expect(directoriesRead).toBeGreaterThanOrEqual(200)
    expect(entriesRead).toBeGreaterThanOrEqual(1500)
    expect(entriesRefused).toBeGreaterThanOrEqual(100)
  }, 10_000)
})
