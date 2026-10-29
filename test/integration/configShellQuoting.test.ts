import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockSafeExec = vi.hoisted(() => vi.fn())
const mockSpawn = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))
vi.mock('../../src/main/handlers/project/setActiveProject', () => ({
  refreshRecorderSettings: vi.fn()
}))
vi.mock('child_process', () => ({ spawn: mockSpawn, default: { spawn: mockSpawn } }))

import updateBrowserType from '../../src/main/handlers/config/updateBrowserType'
import updateTimeout from '../../src/main/handlers/config/updateTimeout'
import updateViewport from '../../src/main/handlers/config/updateViewport'
import installGems from '../../src/main/handlers/ruby/installGems'

// Values reach these handlers over IPC, so a string can arrive where a number is typed
const NASTY = '1; touch /tmp/pwned'
const command = (): string => mockSafeExec.mock.calls[0][0] as string

beforeEach(() => {
  vi.clearAllMocks()
  mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
})

describe('config commands quote their values', () => {
  it('updateBrowserType', async () => {
    await updateBrowserType({} as never, '/p', 'Chrome; touch /tmp/pwned')
    expect(command()).toContain(`raider u browser 'chrome; touch /tmp/pwned'`)
  })

  it('updateBrowserType leaves a plain browser bare', async () => {
    await updateBrowserType({} as never, '/p', 'Firefox')
    expect(command()).toContain('raider u browser firefox')
  })

  it('updateTimeout', async () => {
    await updateTimeout({} as never, '/p', NASTY as never)
    expect(command()).toContain(`raider u timeout '${NASTY}'`)
  })

  it('updateViewport', async () => {
    await updateViewport({} as never, '/p', NASTY as never, 768)
    expect(command()).toContain(`raider u viewport '${NASTY}x768'`)
  })

  it('updateViewport leaves plain numbers bare', async () => {
    await updateViewport({} as never, '/p', 1024, 768)
    expect(command()).toContain('raider u viewport 1024x768')
  })
})

describe('installGems', () => {
  it('quotes each gem name', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter()
    })
    mockSpawn.mockReturnValue(child)
    const done = installGems('ruby', ['ruby_raider', 'x; touch /tmp/pwned'])
    child.emit('close', 0)
    await done
    expect(mockSpawn.mock.calls[0][0]).toBe(`ruby gem install ruby_raider 'x; touch /tmp/pwned'`)
  })
})
