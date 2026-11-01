import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  listSavedLoginsHandler,
  forgetSavedLoginHandler
} from '../../../src/main/handlers/logins/savedLoginsIpc'

let project: string
const authDir = (): string => join(project, '.raider', 'auth')

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'saved-logins-ipc-'))
  await mkdir(authDir(), { recursive: true })
  await writeFile(
    join(authDir(), 'admin.json'),
    JSON.stringify({ format: 1, origin: 'https://site.test', saved_at: '2026-11-01T11:30:00Z' })
  )
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
})

describe('saved logins IPC', () => {
  it('lists nothing and refuses to forget without a project', async () => {
    await setActiveProject(null)
    expect(await listSavedLoginsHandler()).toEqual({ logins: [], unsupportedReason: null })
    expect(await forgetSavedLoginHandler('admin')).toEqual({ error: 'No project is open.' })
  })

  it('list waits for a pending activation and answers for that project', async () => {
    await setActiveProject(null)
    const activating = setActiveProject(project)
    const result = await listSavedLoginsHandler()
    await activating
    expect(result.logins.map((l) => l.name)).toEqual(['admin'])
  })

  it('gives a mobile project no hint, and a web project the helper hint', async () => {
    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
    await setActiveProject(project)
    expect((await listSavedLoginsHandler()).unsupportedReason).toBe('helper')

    await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'appium_lib'\n")
    await setActiveProject(project)
    expect((await listSavedLoginsHandler()).unsupportedReason).toBeNull()
  })

  it('forget waits for a pending activation and removes from that project', async () => {
    await setActiveProject(null)
    const activating = setActiveProject(project)
    const outcome = await forgetSavedLoginHandler('admin')
    await activating
    expect(outcome).toEqual({ ok: true })
    expect(await readdir(authDir())).toEqual([])
  })
})
