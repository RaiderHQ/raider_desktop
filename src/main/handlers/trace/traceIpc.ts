import { dialog, type BrowserWindow, type IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type {
  TraceEntryResult,
  TraceOpenResult,
  TraceSource
} from '../../../shared/types/raiderTrace'
import { resolveAttachmentFile } from '../media/mediaProtocol'
import { closeTrace, openTraceFile, readTraceEntry } from './traceArchive'

// A trace from run.json gets the attachment checks; a picked or dropped file
// may live anywhere, but must be a regular file.
export const resolveTracePath = async (
  source: TraceSource,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> => {
  if (source.kind === 'result') return resolveAttachmentFile(source.path, platform)
  try {
    const raw = source.path
    // Before ANY fs call: a UNC path would open an SMB connection to its host.
    if (raw.includes('\0')) return null
    if (raw.startsWith('\\\\') || raw.startsWith('//')) return null
    const p = platform === 'win32' ? path.win32 : path.posix
    if (!p.isAbsolute(raw)) return null
    const real = await fs.promises.realpath(raw)
    if (!(await fs.promises.lstat(real)).isFile()) return null
    return real
  } catch {
    return null
  }
}

const isTraceSource = (source: unknown): source is TraceSource => {
  if (typeof source !== 'object' || source === null) return false
  const { kind, path: sourcePath } = source as Record<string, unknown>
  return (kind === 'result' || kind === 'file') && typeof sourcePath === 'string'
}

// Never throws: the renderer always gets a result it can show.
export const openTrace = async (source: unknown): Promise<TraceOpenResult> => {
  try {
    if (!isTraceSource(source)) return { ok: false, error: 'notFound' }
    const real = await resolveTracePath(source)
    if (!real) return { ok: false, error: 'notFound' }
    return await openTraceFile(real)
  } catch {
    return { ok: false, error: 'damaged' }
  }
}

// File → Open trace. Calls dialog.showOpenDialog at call time so a test stub takes effect.
export const openTraceFromDialog = async (win: BrowserWindow): Promise<void> => {
  const picked = await dialog.showOpenDialog(win, {
    title: 'Open a trace',
    properties: ['openFile'],
    filters: [{ name: 'Trace', extensions: ['zip'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return
  const result = await openTrace({ kind: 'file', path: picked.filePaths[0] })
  if (!win.isDestroyed()) win.webContents.send('trace-opened', result)
}

const entry = (traceId: unknown, name: unknown): TraceEntryResult => {
  try {
    if (typeof traceId !== 'string') return { ok: false, error: 'closed' }
    if (typeof name !== 'string') return { ok: false, error: 'notCaptured' }
    return readTraceEntry(traceId, name)
  } catch {
    return { ok: false, error: 'damaged' }
  }
}

/** Trace viewer channels; a trace picked from the menu is pushed on 'trace-opened'. */
export function registerTraceIpc(ipcMain: IpcMain): void {
  ipcMain.handle('trace-open', (_event, source: unknown) => openTrace(source))
  ipcMain.handle('trace-entry', (_event, traceId: unknown, name: unknown) => entry(traceId, name))
  ipcMain.handle('trace-close', (_event, traceId: unknown) => {
    if (typeof traceId === 'string') closeTrace(traceId)
  })
}
