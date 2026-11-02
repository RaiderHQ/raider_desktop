// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import path from 'path'

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}))

// An archive that fails in ways its own error mapping never should.
vi.mock('../../../src/main/handlers/trace/traceArchive', () => ({
  openTraceFile: vi.fn(async () => {
    throw new Error('boom')
  }),
  readTraceEntry: vi.fn(() => {
    throw new Error('boom')
  }),
  closeTrace: vi.fn(() => {
    throw new Error('boom')
  })
}))

import type { IpcMain } from 'electron'
import { openTrace, registerTraceIpc } from '../../../src/main/handlers/trace/traceIpc'

const FIXTURE = path.join(__dirname, '../../fixtures/trace-v1/trace.zip')

describe('trace IPC when the archive throws', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  registerTraceIpc({
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)
  } as unknown as IpcMain)

  it('open gives damaged', async () => {
    expect(await openTrace({ kind: 'file', path: FIXTURE })).toEqual({
      ok: false,
      error: 'damaged'
    })
    expect(await handlers.get('trace-open-drop')!({}, FIXTURE)).toEqual({
      ok: false,
      error: 'damaged'
    })
  })

  it('entry gives damaged and close does not throw', async () => {
    expect(await handlers.get('trace-entry')!({}, 'id', 'steps/0001.jpg')).toEqual({
      ok: false,
      error: 'damaged'
    })
    expect(() => handlers.get('trace-close')!({}, 'id')).not.toThrow()
  })
})
