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
  const idx = segments.lastIndexOf('raider-results')
  // raider-results / attachments(-N) / at least one more segment (the file)
  return idx !== -1 && ATTACHMENTS_DIR.test(segments[idx + 1] ?? '') && segments.length > idx + 2
}

export const resolveMediaPath = async (requestUrl: string): Promise<string | null> => {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== `${SCHEME}:` || url.host !== 'file') return null
    const decoded = decodeURIComponent(url.pathname.slice(1))
    if (!path.isAbsolute(decoded) || !hasAttachmentsShape(decoded)) return null
    if (!(path.extname(decoded).toLowerCase() in CONTENT_TYPES)) return null
    const normalized = path.normalize(decoded)
    // Rejects a symlink at any level of the path, ancestors included.
    if ((await fs.promises.realpath(normalized)) !== normalized) return null
    if (!(await fs.promises.lstat(normalized)).isFile()) return null
    return normalized
  } catch {
    return null
  }
}

export const parseRange = (
  header: string | null,
  size: number
): { start: number; end: number } | null => {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startStr, endStr] = match
  if (startStr === '' && endStr === '') return null
  if (startStr === '') {
    const suffix = Number(endStr)
    if (suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(startStr)
  const end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1)
  if (start >= size || end < start) return null
  return { start, end }
}

export const handleMediaRequest = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const filePath = await resolveMediaPath(request.url)
  if (!filePath) return new Response(null, { status: 404 })

  let size: number
  try {
    size = (await fs.promises.stat(filePath)).size
  } catch {
    return new Response(null, { status: 404 })
  }

  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()],
    'Accept-Ranges': 'bytes'
  }

  const rangeHeader = request.headers.get('range')
  let status = 200
  let start = 0
  let end = size - 1
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size)
    if (!range) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    ;({ start, end } = range)
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }

  const length = size === 0 ? 0 : end - start + 1
  headers['Content-Length'] = String(length)
  if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers })

  const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream
  return new Response(stream, { status, headers })
}

export const registerMediaScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { stream: true, supportFetchAPI: true } }
  ])
}

export const registerMediaHandler = (): void => {
  protocol.handle(SCHEME, handleMediaRequest)
}
