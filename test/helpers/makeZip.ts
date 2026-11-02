import zlib from 'zlib'

export interface MakeZipEntry {
  name: string
  data: Buffer | string
  method?: 0 | 8
  unixMode?: number
  declaredSize?: number
  flags?: number
  // Local-header overrides, for headers that disagree with the central directory.
  localFlags?: number
  zeroLocalSizes?: boolean
}

let crcTable: Uint32Array | undefined

function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Writes a valid zip. `declaredSize` overrides the uncompressed size in both
// headers; the compressed size always stays the real data length.
export function makeZip(entries: MakeZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const method = entry.method ?? 0
    const stored = method === 8 ? zlib.deflateRawSync(raw) : raw
    const name = Buffer.from(entry.name)
    const size = entry.declaredSize ?? raw.length
    const crc = crc32(raw)
    const flags = entry.flags ?? 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.localFlags ?? flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.zeroLocalSizes ? 0 : stored.length, 18)
    local.writeUInt32LE(entry.zeroLocalSizes ? 0 : size, 22)
    local.writeUInt16LE(name.length, 26)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(entry.unixMode === undefined ? 20 : (3 << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(stored.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(entry.unixMode === undefined ? 0 : (entry.unixMode << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, stored)
    centrals.push(central, name)
    offset += local.length + name.length + stored.length
  }

  const directory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, eocd])
}
