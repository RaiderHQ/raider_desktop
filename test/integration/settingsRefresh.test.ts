import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'

vi.mock('electron', () => ({ app: { getPath: vi.fn() }, BrowserWindow: class {} }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import updateBrowserUrl from '../../src/main/handlers/config/updateBrowserUrl'
import updateBrowserType from '../../src/main/handlers/config/updateBrowserType'
import updateHeadlessMode from '../../src/main/handlers/config/updateHeadlessMode'
import updateTimeout from '../../src/main/handlers/config/updateTimeout'

const mockExec = exec as unknown as ReturnType<typeof vi.fn>
let dir: string
const configFile = (): string => join(dir, 'config', 'config.yml')

// Stands in for the gem CLI: rewrites one config key the way `raider u ...` would
function cliSets(key: string, value: string): void {
  mockExec.mockImplementation(
    (
      _cmd: string,
      _opts: object,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      const lines = readFileSync(configFile(), 'utf-8')
        .split('\n')
        .filter((l) => l && !l.startsWith(`${key}:`))
      writeFileSync(configFile(), [...lines, `${key}: ${value}`, ''].join('\n'))
      cb(null, 'ok', '')
    }
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  dir = await mkdtemp(join(tmpdir(), 'settings-refresh-'))
  await mkdir(join(dir, 'config'))
  await writeFile(
    configFile(),
    'url: https://old.test/\nbrowser: chrome\nheadless: false\ntimeout: 5\n'
  )
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  await setActiveProject(dir)
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(dir, { recursive: true, force: true })
})

describe('project settings changes reach the recorder without a restart', () => {
  it('update-browser-url refreshes baseUrl', async () => {
    cliSets('url', 'https://new.test/')
    expect((await updateBrowserUrl({} as never, dir, 'https://new.test/')).success).toBe(true)
    expect(appState.recorderSettings.baseUrl).toBe('https://new.test/')
  })

  it('update-browser-type refreshes browser', async () => {
    cliSets('browser', 'firefox')
    await updateBrowserType({} as never, dir, 'firefox')
    expect(appState.recorderSettings.browser).toBe('firefox')
  })

  it('update-headless-mode refreshes headless', async () => {
    cliSets('headless', 'true')
    await updateHeadlessMode({} as never, dir, true)
    expect(appState.recorderSettings.headless).toBe(true)
  })

  it('update-timeout refreshes the wait when the config has no explicit_wait', async () => {
    cliSets('timeout', '25')
    await updateTimeout({} as never, dir, 25)
    expect(appState.recorderSettings.explicitWait).toBe(25)
  })

  it('does not touch the active settings for a different project', async () => {
    cliSets('url', 'https://new.test/')
    await updateBrowserUrl({} as never, '/some/other/project', 'https://new.test/')
    expect(appState.recorderSettings.baseUrl).toBe('https://old.test/')
  })

  it('keeps the old settings when the CLI fails', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        cb(new Error('boom'), '', 'boom')
      }
    )
    await updateBrowserUrl({} as never, dir, 'https://new.test/')
    expect(appState.recorderSettings.baseUrl).toBe('https://old.test/')
    expect(await readFile(configFile(), 'utf-8')).toContain('https://old.test/')
  })
})
