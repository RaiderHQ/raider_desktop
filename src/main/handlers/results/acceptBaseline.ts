import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { AcceptBaselineResult } from '../../../shared/types/acceptBaseline'
import { appState } from '../appState'
import { resolveAttachmentFile } from '../media/mediaProtocol'

const MAX_BASELINE_LENGTH = 300
const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const DIR_SEGMENT = /^[A-Za-z0-9_-]+$/
const FILE_SEGMENT = /^[A-Za-z0-9_-]+\.png$/

class Denied extends Error {}

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException)?.code

// Opens without following a link or blocking on a FIFO, and reads at most the cap.
// Throws Denied when the file is not a regular file or is too large.
const readBounded = async (file: string): Promise<Buffer> => {
  let handle: fs.promises.FileHandle
  try {
    handle = await fs.promises.open(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)
    )
  } catch (error) {
    if (errorCode(error) === 'ELOOP') throw new Denied()
    throw error
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Denied()
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, MAX_IMAGE_BYTES + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > MAX_IMAGE_BYTES) throw new Denied()
      chunks.push(chunk.subarray(0, bytesRead))
    }
    return Buffer.concat(chunks)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

// Creates each missing directory one level at a time (never recursive, which would
// follow a link swapped in meanwhile) and requires every level to be a real directory.
const ensureDirs = async (root: string, dirSegments: string[]): Promise<void> => {
  let current = root
  for (const segment of dirSegments) {
    current = path.join(current, segment)
    let stat: fs.Stats | null = null
    try {
      stat = await fs.promises.lstat(current)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }
    if (!stat) {
      try {
        await fs.promises.mkdir(current)
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error
      }
      stat = await fs.promises.lstat(current)
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Denied()
  }
}

// screenshots/baselines/<browser>/<name>.png as segments, or null.
const parseBaselinePath = (raw: unknown): string[] | null => {
  if (typeof raw !== 'string' || raw.length > MAX_BASELINE_LENGTH) return null
  if (raw.includes('\0') || raw.includes('\\') || raw.startsWith('/')) return null
  const segments = raw.split('/')
  if (segments.length < 4) return null
  if (segments[0] !== 'screenshots' || segments[1] !== 'baselines') return null
  const last = segments.length - 1
  const valid = segments.every((s, i) => (i === last ? FILE_SEGMENT : DIR_SEGMENT).test(s))
  return valid ? segments : null
}

// Every existing prefix under the real project root must be a real directory (the
// target a regular file), never a link. Returns whether the target file exists.
const walkExisting = async (root: string, segments: string[]): Promise<boolean> => {
  let current = root
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i])
    let stat: fs.Stats
    try {
      stat = await fs.promises.lstat(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw new Denied()
    }
    if (stat.isSymbolicLink()) throw new Denied()
    const isTarget = i === segments.length - 1
    if (isTarget ? !stat.isFile() : !stat.isDirectory()) throw new Denied()
  }
  return true
}

const resolveActual = async (
  actualPath: unknown,
  root: string,
  platform: NodeJS.Platform
): Promise<string | null> => {
  if (typeof actualPath !== 'string') return null
  const real = await resolveAttachmentFile(actualPath, platform, (ext) => ext === '.png')
  if (!real) return null
  const p = platform === 'win32' ? path.win32 : path.posix
  const results = await fs.promises.realpath(path.join(root, 'raider-results'))
  // raider-results / attachments(-N) / <file>
  return p.dirname(p.dirname(real)) === results ? real : null
}

const writeAtomically = async (root: string, segments: string[], bytes: Buffer): Promise<void> => {
  const dirSegments = segments.slice(0, -1)
  const dir = path.join(root, ...dirSegments)
  const target = path.join(dir, segments[segments.length - 1])
  await ensureDirs(root, dirSegments)
  await walkExisting(root, segments)
  // Not a baseline name (no .png ending), so a leftover is never mistaken for one.
  const temp = path.join(
    dir,
    `.${segments[segments.length - 1]}.${crypto.randomBytes(8).toString('hex')}.tmp`
  )
  try {
    await fs.promises.writeFile(temp, bytes, { flag: 'wx' })
    await walkExisting(root, segments)
    await fs.promises.rename(temp, target)
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Copies one actual screenshot of the active project over its baseline. Both paths
 * come from the renderer, so both are re-checked here; the project is never an
 * argument. Never throws and returns only the four error codes.
 */
export const acceptBaseline = async (
  actualPath: unknown,
  baselinePath: unknown,
  confirm: (baseline: string, actualName: string) => Promise<boolean>,
  platform: NodeJS.Platform = process.platform
): Promise<AcceptBaselineResult> => {
  try {
    if (!appState.projectPath) return { ok: false, error: 'notFound' }
    const root = await fs.promises.realpath(appState.projectPath)
    const actual = await resolveActual(actualPath, root, platform)
    if (!actual) return { ok: false, error: 'notFound' }

    const segments = parseBaselinePath(baselinePath)
    if (!segments) return { ok: false, error: 'denied' }
    const relative = segments.join('/')

    const exists = await walkExisting(root, segments)
    let bytes: Buffer
    try {
      bytes = await readBounded(actual)
    } catch {
      return { ok: false, error: 'notFound' }
    }
    if (exists) {
      let current: Buffer
      try {
        current = await readBounded(path.join(root, ...segments))
      } catch (error) {
        const denied = error instanceof Denied || errorCode(error) === 'ELOOP'
        return { ok: false, error: denied ? 'denied' : 'writeFailed' }
      }
      if (current.equals(bytes)) return { ok: true, path: relative, unchanged: true }
    }

    let confirmed = false
    try {
      confirmed = (await confirm(relative, path.basename(actual))) === true
    } catch {
      confirmed = false
    }
    if (!confirmed) return { ok: false, error: 'cancelled' }

    try {
      await writeAtomically(root, segments, bytes)
    } catch (error) {
      return { ok: false, error: error instanceof Denied ? 'denied' : 'writeFailed' }
    }
    return { ok: true, path: relative, unchanged: false }
  } catch (error) {
    if (error instanceof Denied) return { ok: false, error: 'denied' }
    return { ok: false, error: 'notFound' }
  }
}
