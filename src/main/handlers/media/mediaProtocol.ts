import { protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

const SCHEME = 'raider-media'

const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime'
}

const ATTACHMENTS_DIR = /^attachments(-\d+)?$/

const hasAttachmentsShape = (rawPath: string): boolean => {
  const segments = rawPath.split(/[\\/]/)
  if (segments.includes('..')) return false
  if (segments.filter((s) => s === 'raider-results').length !== 1) return false
  const idx = segments.indexOf('raider-results')
  // raider-results / attachments(-N) / <file>, exactly one segment for the file
  return (
    ATTACHMENTS_DIR.test(segments[idx + 1] ?? '') &&
    segments.length === idx + 3 &&
    segments[idx + 2] !== ''
  )
}

export const resolveMediaPath = async (
  requestUrl: string,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> => {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== `${SCHEME}:` || url.host !== 'file') return null
    const decoded = decodeURIComponent(url.pathname.slice(1))
    // Everything below runs before ANY fs call: a UNC path would make realpath
    // open an SMB connection to the attacker's host and leak NTLM credentials.
    if (decoded.includes('\0')) return null
    if (decoded.startsWith('\\\\') || decoded.startsWith('//')) return null
    const win = platform === 'win32'
    const p = win ? path.win32 : path.posix
    if (win && !/^[A-Za-z]:[\\/]/.test(decoded)) return null
    if (!p.isAbsolute(decoded) || !hasAttachmentsShape(decoded)) return null
    if (!(p.extname(decoded).toLowerCase() in CONTENT_TYPES)) return null
    const normalized = p.normalize(decoded)
    // Rejects a symlink at any level of the path, ancestors included.
    const real = await fs.promises.realpath(normalized)
    if (win ? real.toLowerCase() !== normalized.toLowerCase() : real !== normalized) return null
    if (!(await fs.promises.lstat(normalized)).isFile()) return null
    return normalized
  } catch {
    return null
  }
}

export type RangeResult =
  | { kind: 'none' }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'unsatisfiable' }

// RFC 7233 3.1: a syntactically invalid or unsupported Range is ignored ('none').
export const parseRange = (header: string | null, size: number): RangeResult => {
  if (!header) return { kind: 'none' }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return { kind: 'none' }
  const [, startStr, endStr] = match
  if (startStr === '' && endStr === '') return { kind: 'none' }
  if (startStr === '') {
    const suffix = Number(endStr)
    if (suffix <= 0 || size <= 0) return { kind: 'unsatisfiable' }
    return { kind: 'range', start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(startStr)
  if (endStr !== '' && Number(endStr) < start) return { kind: 'none' }
  if (start >= size) return { kind: 'unsatisfiable' }
  const end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1)
  return { kind: 'range', start, end }
}

export const handleMediaRequest = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const filePath = await resolveMediaPath(request.url)
  if (!filePath) return new Response(null, { status: 404 })

  let handle: fs.promises.FileHandle
  try {
    handle = await fs.promises.open(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
    )
  } catch {
    return new Response(null, { status: 404 })
  }

  let streaming = false
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) return new Response(null, { status: 404 })
    const size = stat.size

    const headers: Record<string, string> = {
      'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()],
      'Accept-Ranges': 'bytes'
    }

    const range = parseRange(request.headers.get('range'), size)
    if (range.kind === 'unsatisfiable' || (size === 0 && range.kind === 'range')) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    let status = 200
    let start = 0
    let end = size - 1
    if (range.kind === 'range') {
      ;({ start, end } = range)
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }

    const length = size === 0 ? 0 : end - start + 1
    headers['Content-Length'] = String(length)
    if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers })

    // autoClose (default true) closes the handle when the stream ends, errors or is cancelled.
    const stream = Readable.toWeb(handle.createReadStream({ start, end })) as ReadableStream
    streaming = true
    return new Response(stream, { status, headers })
  } finally {
    if (!streaming) await handle.close().catch(() => undefined)
  }
}

export const registerMediaScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { stream: true, supportFetchAPI: true } }
  ])
}

export const registerMediaHandler = (): void => {
  protocol.handle(SCHEME, handleMediaRequest)
}
