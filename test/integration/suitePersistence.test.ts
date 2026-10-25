import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'fs/promises'
import { mkdtemp, readFile, writeFile, rm, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import createSuite from '../../src/main/handlers/createSuite'
import deleteSuite from '../../src/main/handlers/deleteSuite'
import deleteTest from '../../src/main/handlers/deleteTest'
import saveRecording from '../../src/main/handlers/recording/saveRecording'
import * as persistence from '../../src/main/handlers/suitePersistence'
import { loadSuites, saveSuites } from '../../src/main/handlers/suitePersistence'
import type { Suite } from '../../src/shared/types/suite'

let a: string
let b: string
const suite = (name: string): Suite => ({ id: `id-${name}`, name, tests: [] })
const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )
const send = vi.fn()
const win = { webContents: { send } } as never

beforeEach(async () => {
  a = await mkdtemp(join(tmpdir(), 'suites-a-'))
  b = await mkdtemp(join(tmpdir(), 'suites-b-'))
  appState.projectPath = null
  appState.suites = new Map()
  appState.mainWindow = null
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  send.mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(a, { recursive: true, force: true })
  await rm(b, { recursive: true, force: true })
})

describe('suite files', () => {
  it('round trips, creating .raider/', async () => {
    const suites = [{ ...suite('s'), tests: [{ id: 't', name: 'T', url: '', steps: ['x'] }] }]
    await saveSuites(a, suites as Suite[])
    expect(await loadSuites(a)).toEqual({ suites, recoveredFromCorrupt: false })
  })

  it('returns empty when there is no file', async () => {
    expect(await loadSuites(a)).toEqual({ suites: [], recoveredFromCorrupt: false })
  })

  it('loads a plain array of suites', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), JSON.stringify([suite('x')]))
    expect((await loadSuites(a)).suites).toEqual([suite('x')])
  })

  it('is atomic: a failed rename leaves no suites.json', async () => {
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('boom'))
    await expect(saveSuites(a, [suite('x')])).rejects.toThrow('boom')
    expect(await exists(join(a, '.raider', 'suites.json'))).toBe(false)
  })

  it('a failed write does not block later writes', async () => {
    vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('boom'))
    await expect(saveSuites(a, [suite('x')])).rejects.toThrow()
    await saveSuites(a, [suite('y')])
    expect((await loadSuites(a)).suites).toEqual([suite('y')])
  })

  it('quick consecutive saves end with the last one', async () => {
    await Promise.all([
      saveSuites(a, [suite('1')]),
      saveSuites(a, [suite('2')]),
      saveSuites(a, [suite('3')])
    ])
    expect((await loadSuites(a)).suites).toEqual([suite('3')])
  })

  it('corrupt file is moved to suites.json.bak', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), '{not json')
    expect(await loadSuites(a)).toEqual({ suites: [], recoveredFromCorrupt: true })
    expect(await readFile(join(a, '.raider', 'suites.json.bak'), 'utf-8')).toBe('{not json')
    expect(await exists(join(a, '.raider', 'suites.json'))).toBe(false)
  })
})

describe('setActiveProject loading', () => {
  it('loads suites, replacing the previous ones, and sends suite-updated', async () => {
    await saveSuites(a, [suite('A')])
    appState.mainWindow = win
    appState.suites = new Map([['old', suite('old')]])
    await setActiveProject(a)
    expect(Array.from(appState.suites.values())).toEqual([suite('A')])
    expect(send).toHaveBeenCalledWith('suite-updated', [suite('A')])
    expect(send).not.toHaveBeenCalledWith('suites-recovered')
  })

  it('sends suites-recovered for a corrupt file', async () => {
    await fsp.mkdir(join(a, '.raider'))
    await writeFile(join(a, '.raider', 'suites.json'), 'nope')
    appState.mainWindow = win
    await setActiveProject(a)
    expect(appState.suites.size).toBe(0)
    expect(send).toHaveBeenCalledWith('suites-recovered')
  })

  it('null clears suites', async () => {
    await saveSuites(a, [suite('A')])
    await setActiveProject(a)
    await setActiveProject(null)
    expect(appState.suites.size).toBe(0)
  })

  it('switching project saves to the new path only', async () => {
    await setActiveProject(a)
    await createSuite(null, 'A-suite')
    await setActiveProject(b)
    await createSuite(null, 'B-suite')
    expect((await loadSuites(a)).suites.map((s) => s.name)).toEqual(['A-suite'])
    expect((await loadSuites(b)).suites.map((s) => s.name)).toEqual(['B-suite'])
  })

  it('persistActiveSuites is a no-op without a project', async () => {
    await expect(persistence.persistActiveSuites()).resolves.toBeUndefined()
  })
})

describe('handlers persist', () => {
  it('createSuite, saveRecording, deleteTest and deleteSuite each call persistActiveSuites', async () => {
    const spy = vi.spyOn(persistence, 'persistActiveSuites').mockResolvedValue()
    const created = await createSuite(null, 'S')
    const id = created.suite!.id
    expect(spy).toHaveBeenCalledTimes(1)

    await saveRecording(win, id, { id: 't1', name: 'T', url: '', steps: [] } as never)
    expect(spy).toHaveBeenCalledTimes(2)

    await deleteTest(null, { suiteId: id, testId: 't1' })
    expect(spy).toHaveBeenCalledTimes(3)

    await deleteSuite(null, id)
    expect(spy).toHaveBeenCalledTimes(4)
  })
})
