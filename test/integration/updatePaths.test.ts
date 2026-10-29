import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'
import type { IpcMainInvokeEvent } from 'electron'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/config/updatePaths'

const mockExec = exec as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: (e: Error | null, o: string, r: string) => void) => cb(null, 'ok', ''))
})

describe('updatePaths handler', () => {
  it('leaves a safe path bare and appends the type flag', async () => {
    await handler({} as IpcMainInvokeEvent, '/project', 'spec/pages', 'spec')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('raider u path spec/pages -s')
  })

  it.each([
    ['ampersand', 'a&b', "'a&b'"],
    ['command substitution', '$(whoami)', "'$(whoami)'"],
    ['backticks', '`id`', "'`id`'"],
    ['spaces', 'my pages', "'my pages'"],
    ['single quote', "it's", "'it'\\''s'"]
  ])('quotes a path with %s', async (_n, input, quoted) => {
    await handler({} as IpcMainInvokeEvent, '/project', input, 'feature')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain(`raider u path ${quoted} -f`)
  })
})
