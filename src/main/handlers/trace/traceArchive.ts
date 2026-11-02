import crypto from 'crypto'
import fs from 'fs'
import { parseTraceIndex } from '../../../shared/trace/parseTraceIndex'
import type {
  TraceEntryResult,
  TraceOpenError,
  TraceOpenResult
} from '../../../shared/types/raiderTrace'
import {
  readZipDirectory,
  readZipEntry,
  ZipRefused,
  TRACE_ZIP_LIMITS,
  type ZipEntry
} from './zipReader'

// Holds opened raider-trace zips in memory, so the renderer gets the index once
// and each screenshot or snapshot on demand, by trace id and entry name.

interface OpenTrace {
  realPath: string
  buf: Buffer
  entries: Map<string, ZipEntry>
  // The entries the index points at; nothing else is ever served.
  referenced: Set<string>
}

export const MAX_OPEN_TRACES = 2

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png' }

// Insertion-ordered, so the first key is the oldest open trace.
const openTraces = new Map<string, OpenTrace>()

const fail = (error: TraceOpenError): TraceOpenResult => ({ ok: false, error })

// Reads exactly `size` bytes; a file that grew after fstat is cut, one that shrank is short.
async function readExactly(handle: fs.promises.FileHandle, size: number): Promise<Buffer> {
  const buf = Buffer.alloc(size)
  let filled = 0
  while (filled < size) {
    const { bytesRead } = await handle.read(buf, filled, size - filled, filled)
    if (bytesRead === 0) break
    filled += bytesRead
  }
  return buf.subarray(0, filled)
}

async function readTraceFile(realPath: string): Promise<Buffer | TraceOpenError> {
  let handle: fs.promises.FileHandle
  try {
    handle = await fs.promises.open(
      realPath,
      // O_NONBLOCK: a FIFO swapped in after the path checks must not block a libuv thread.
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)
    )
  } catch {
    return 'notFound'
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) return 'notFound'
    if (stat.size > TRACE_ZIP_LIMITS.maxZipBytes) return 'tooLarge'
    return await readExactly(handle, stat.size)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

function remember(trace: OpenTrace): string {
  // Opening the same file again replaces the earlier copy rather than keeping both.
  for (const [id, open] of openTraces) {
    if (open.realPath === trace.realPath) openTraces.delete(id)
  }
  const traceId = crypto.randomUUID()
  openTraces.set(traceId, trace)
  while (openTraces.size > MAX_OPEN_TRACES) {
    openTraces.delete(openTraces.keys().next().value as string)
  }
  return traceId
}

export async function openTraceFile(realPath: string): Promise<TraceOpenResult> {
  try {
    const buf = await readTraceFile(realPath)
    if (typeof buf === 'string') return fail(buf)

    const entries = readZipDirectory(buf)
    const indexEntry = entries.get('trace.json')
    if (!indexEntry) return fail('notTrace')
    let json: unknown
    try {
      json = JSON.parse(readZipEntry(buf, indexEntry).toString('utf8'))
    } catch {
      return fail('damaged')
    }

    const parsed = parseTraceIndex(json, new Set(entries.keys()))
    if (!parsed.ok) return fail(parsed.error)

    const referenced = new Set<string>()
    for (const step of parsed.index.steps) {
      if (step.screenshot !== null) referenced.add(step.screenshot)
      if (step.snapshot !== null) referenced.add(step.snapshot)
    }
    const traceId = remember({ realPath, buf, entries, referenced })
    return { ok: true, traceId, index: parsed.index }
  } catch (error) {
    return fail(error instanceof ZipRefused ? error.reason : 'damaged')
  }
}

export function readTraceEntry(traceId: string, name: string): TraceEntryResult {
  const trace = openTraces.get(traceId)
  if (!trace) return { ok: false, error: 'closed' }
  const entry = trace.referenced.has(name) ? trace.entries.get(name) : undefined
  if (!entry) return { ok: false, error: 'notCaptured' }

  let data: Buffer
  try {
    data = readZipEntry(trace.buf, entry)
  } catch {
    return { ok: false, error: 'damaged' }
  }
  const imageType = IMAGE_TYPES[name.slice(name.lastIndexOf('.'))]
  if (imageType) {
    return {
      ok: true,
      kind: 'image',
      dataUrl: `data:${imageType};base64,${data.toString('base64')}`
    }
  }
  return { ok: true, kind: name.endsWith('.xml') ? 'xml' : 'html', text: data.toString('utf8') }
}

export function closeTrace(traceId: string): void {
  openTraces.delete(traceId)
}
