import zlib from 'zlib'
import { MAX_STEPS } from '../../../shared/trace/parseTraceIndex'
import { TRACE_ENTRY_NAME } from '../../../shared/types/raiderTrace'

// Reads a raider-trace zip in memory. The zip may come from anywhere, so every
// offset is bounds-checked and every limit is checked before anything inflates.

export type ZipRefusal = 'tooLarge' | 'unsafe' | 'notTrace' | 'damaged'

export class ZipRefused extends Error {
  readonly reason: ZipRefusal

  constructor(reason: ZipRefusal) {
    super(`Zip refused: ${reason}`)
    this.name = 'ZipRefused'
    this.reason = reason
  }
}

export interface ZipEntry {
  name: string
  method: 0 | 8
  compressedSize: number
  size: number
  localHeaderOffset: number
  flags: number
  // Where the central directory starts; an entry's data must end before it.
  centralOffset: number
}

export interface ZipLimits {
  maxZipBytes: number
  maxEntries: number
  maxTotalBytes: number
  maxEntryBytes: number
  maxRatio: number
  ratioFloorBytes: number
}

const MiB = 1024 * 1024

export const TRACE_ZIP_LIMITS: ZipLimits = {
  maxZipBytes: 32 * MiB,
  // One screenshot and one snapshot per step the index can hold, plus trace.json;
  // the byte caps below bound the cost, whatever max_steps the project uses.
  maxEntries: 2 * MAX_STEPS + 1,
  maxTotalBytes: 150 * MiB,
  maxEntryBytes: 32 * MiB,
  maxRatio: 100,
  ratioFloorBytes: 1 * MiB
}

const EOCD_SIGNATURE = 0x06054b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_SIZE = 22
const CENTRAL_SIZE = 46
const LOCAL_SIZE = 30
const MAX_COMMENT = 0xffff

const FLAG_ENCRYPTED = 0x0001
const FLAG_DATA_DESCRIPTOR = 0x0008
const FLAG_STRONG_ENCRYPTION = 0x0040
const FLAG_MASKED_HEADER = 0x2000

// The flags whose local and central values must agree.
const CHECKED_FLAGS = FLAG_ENCRYPTED | FLAG_DATA_DESCRIPTOR | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADER

const S_IFMT = 0o170000
const S_IFLNK = 0o120000

const refuse = (reason: ZipRefusal): never => {
  throw new ZipRefused(reason)
}

const inBounds = (buf: Buffer, start: number, length: number): boolean =>
  start >= 0 && length >= 0 && start + length <= buf.length

const u16 = (buf: Buffer, at: number): number =>
  inBounds(buf, at, 2) ? buf.readUInt16LE(at) : refuse('damaged')

const u32 = (buf: Buffer, at: number): number =>
  inBounds(buf, at, 4) ? buf.readUInt32LE(at) : refuse('damaged')

function findEndOfCentralDirectory(buf: Buffer): number {
  const lowest = Math.max(0, buf.length - EOCD_SIZE - MAX_COMMENT)
  for (let at = buf.length - EOCD_SIZE; at >= lowest; at--) {
    if (buf.readUInt32LE(at) === EOCD_SIGNATURE && at + EOCD_SIZE + buf.readUInt16LE(at + 20) === buf.length) {
      return at
    }
  }
  return refuse('notTrace')
}

const isPrintableAscii = (bytes: Buffer): boolean => bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)

export function readZipDirectory(buf: Buffer, limits: ZipLimits = TRACE_ZIP_LIMITS): Map<string, ZipEntry> {
  if (buf.length > limits.maxZipBytes) refuse('tooLarge')

  const eocd = findEndOfCentralDirectory(buf)
  const disk = buf.readUInt16LE(eocd + 4)
  const centralDisk = buf.readUInt16LE(eocd + 6)
  const diskCount = buf.readUInt16LE(eocd + 8)
  const count = buf.readUInt16LE(eocd + 10)
  const centralSize = buf.readUInt32LE(eocd + 12)
  const centralOffset = buf.readUInt32LE(eocd + 16)

  if (disk !== 0 || centralDisk !== 0 || diskCount !== count) refuse('unsafe')
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) refuse('unsafe')
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIGNATURE) refuse('unsafe')
  if (count > limits.maxEntries) refuse('tooLarge')
  if (centralOffset + centralSize > eocd) refuse('damaged')

  const entries = new Map<string, ZipEntry>()
  const centralEnd = centralOffset + centralSize
  let total = 0
  let at = centralOffset

  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_SIZE > centralEnd || u32(buf, at) !== CENTRAL_SIGNATURE) refuse('damaged')

    const flags = u16(buf, at + 8)
    const method = u16(buf, at + 10)
    const compressedSize = u32(buf, at + 20)
    const size = u32(buf, at + 24)
    const nameLength = u16(buf, at + 28)
    const extraLength = u16(buf, at + 30)
    const commentLength = u16(buf, at + 32)
    const startDisk = u16(buf, at + 34)
    const externalAttrs = u32(buf, at + 38)
    const localHeaderOffset = u32(buf, at + 42)
    const recordEnd = at + CENTRAL_SIZE + nameLength + extraLength + commentLength
    if (recordEnd > centralEnd) refuse('damaged')

    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADER)) refuse('unsafe')
    if (method !== 0 && method !== 8) refuse('unsafe')
    if (compressedSize === 0xffffffff || size === 0xffffffff || localHeaderOffset === 0xffffffff) {
      refuse('unsafe')
    }
    if (startDisk !== 0) refuse('unsafe')

    const nameBytes = buf.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength)
    if (!isPrintableAscii(nameBytes)) refuse('unsafe')
    const name = nameBytes.toString('latin1')
    if (!TRACE_ENTRY_NAME.test(name)) refuse('unsafe')
    if (((externalAttrs >>> 16) & S_IFMT) === S_IFLNK) refuse('unsafe')
    if (entries.has(name)) refuse('unsafe')

    if (size > limits.maxEntryBytes) refuse('tooLarge')
    if (method === 0 && size !== compressedSize) refuse('damaged')
    if (size > limits.ratioFloorBytes && size / Math.max(compressedSize, 1) > limits.maxRatio) refuse('unsafe')
    total += size
    if (total > limits.maxTotalBytes) refuse('tooLarge')

    // The entry's header and data must sit before the central directory.
    if (localHeaderOffset + LOCAL_SIZE + nameLength + compressedSize > centralOffset) refuse('damaged')

    entries.set(name, {
      name,
      method: method as 0 | 8,
      compressedSize,
      size,
      localHeaderOffset,
      flags,
      centralOffset
    })
    at = recordEnd
  }

  return entries
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const at = entry.localHeaderOffset
  if (u32(buf, at) !== LOCAL_SIGNATURE) refuse('damaged')

  const flags = u16(buf, at + 6)
  const method = u16(buf, at + 8)
  const compressedSize = u32(buf, at + 18)
  const size = u32(buf, at + 22)
  const nameLength = u16(buf, at + 26)
  const extraLength = u16(buf, at + 28)

  if ((flags & CHECKED_FLAGS) !== (entry.flags & CHECKED_FLAGS) || method !== entry.method) refuse('damaged')
  // With a data descriptor (set in both headers) the local sizes may legitimately be zero.
  const deferredSizes = (flags & FLAG_DATA_DESCRIPTOR) !== 0 && compressedSize === 0 && size === 0
  if (!deferredSizes && (compressedSize !== entry.compressedSize || size !== entry.size)) refuse('damaged')

  const nameStart = at + LOCAL_SIZE
  if (!inBounds(buf, nameStart, nameLength)) refuse('damaged')
  if (buf.toString('latin1', nameStart, nameStart + nameLength) !== entry.name) refuse('damaged')

  const dataStart = nameStart + nameLength + extraLength
  if (!inBounds(buf, dataStart, entry.compressedSize) || dataStart + entry.compressedSize > entry.centralOffset) {
    refuse('damaged')
  }
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize)

  if (entry.size === 0) return Buffer.alloc(0)
  if (entry.method === 0) return Buffer.from(data)

  let inflated: Buffer
  try {
    inflated = zlib.inflateRawSync(data, { maxOutputLength: entry.size })
  } catch {
    return refuse('damaged')
  }
  if (inflated.length !== entry.size) refuse('damaged')
  return inflated
}
