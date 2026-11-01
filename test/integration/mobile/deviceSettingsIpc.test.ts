import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'fs/promises'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  getDeviceSettingsHandler,
  saveDeviceSettingsHandler
} from '../../../src/main/handlers/mobile/deviceSettingsIpc'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'mobile', name), 'utf-8')

let project: string
const capsPath = (): string => join(project, 'config', 'capabilities.yml')
const configPath = (): string => join(project, 'config', 'config.yml')

async function openProject(caps: string | null, config?: string): Promise<void> {
  await mkdir(join(project, 'config'), { recursive: true })
  if (caps !== null) await writeFile(capsPath(), caps)
  if (config !== undefined) await writeFile(configPath(), config)
  await setActiveProject(project)
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'device-settings-'))
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
})

describe('get-device-settings', () => {
  it('returns the top block under ios for an iOS project', async () => {
    await openProject(fixture('ios-3.12.capabilities.yml'))
    expect(await getDeviceSettingsHandler(project)).toEqual({
      platform: 'ios',
      ios: {
        deviceName: 'iPhone 15',
        platformVersion: '17.0',
        app: 'RaiderTestApp.app',
        automationName: 'XCUITest'
      }
    })
  })

  it('returns the top block under android for an Android project', async () => {
    await openProject(fixture('android-3.11.capabilities.yml'))
    const result = await getDeviceSettingsHandler(project)
    expect(result).toMatchObject({ platform: 'android', android: { deviceName: 'Pixel 8 API 34' } })
    expect(result).not.toHaveProperty('ios')
    expect(result).not.toHaveProperty('runOn')
  })

  it('returns both blocks and runOn for a cross-platform project', async () => {
    await openProject(
      fixture('cross_platform-3.12.capabilities.yml'),
      'platform: :android\ntimeout: 10\n'
    )
    expect(await getDeviceSettingsHandler(project)).toMatchObject({
      platform: 'cross_platform',
      runOn: 'android',
      ios: { deviceName: 'iPhone 15' },
      android: { deviceName: 'Pixel 8 API 34' }
    })
  })

  it('defaults runOn to ios without a config file', async () => {
    await openProject(fixture('cross_platform-3.12.capabilities.yml'))
    expect(await getDeviceSettingsHandler(project)).toMatchObject({ runOn: 'ios' })
  })

  it('returns an error for a missing capabilities file', async () => {
    await openProject(null)
    expect(await getDeviceSettingsHandler(project)).toHaveProperty('error')
  })

  it('returns an error when no platform can be detected', async () => {
    await openProject('browserstack:\n  platformName: iOS\n')
    expect(await getDeviceSettingsHandler(project)).toHaveProperty('error')
  })

  it('returns an error for a path that is not the active project', async () => {
    await openProject(fixture('ios-3.12.capabilities.yml'))
    expect(await getDeviceSettingsHandler(join(project, '..'))).toHaveProperty('error')
    expect(await getDeviceSettingsHandler(42)).toHaveProperty('error')
  })

  it('returns an error when no project is open', async () => {
    await setActiveProject(null)
    expect(await getDeviceSettingsHandler(project)).toHaveProperty('error')
  })
})

describe('save-device-settings', () => {
  it('writes a device edit through to disk and leaves no temp file', async () => {
    const original = fixture('ios-3.12.capabilities.yml')
    await openProject(original)
    const result = await saveDeviceSettingsHandler(project, {
      block: 'top',
      edit: { deviceName: 'iPhone 16' }
    })
    expect(result).toEqual({ ok: true })
    const written = await readFile(capsPath(), 'utf-8')
    expect(written).toBe(original.replace('deviceName: iPhone 15', "deviceName: 'iPhone 16'"))
    expect(await readdir(join(project, 'config'))).toEqual(['capabilities.yml'])
  })

  it('edits one block of a cross-platform project', async () => {
    await openProject(fixture('cross_platform-3.11.capabilities.yml'))
    expect(
      await saveDeviceSettingsHandler(project, { block: 'android', edit: { app: 'b.apk' } })
    ).toEqual({ ok: true })
    expect(await getDeviceSettingsHandler(project)).toMatchObject({
      android: { app: 'b.apk' },
      ios: { app: 'RaiderTestApp.app' }
    })
  })

  it('writes runOn for a cross-platform project, creating config.yml if needed', async () => {
    await openProject(fixture('cross_platform-3.12.capabilities.yml'))
    expect(await saveDeviceSettingsHandler(project, { runOn: 'android' })).toEqual({ ok: true })
    expect(await readFile(configPath(), 'utf-8')).toBe('platform: android\n')
  })

  it('refuses runOn on a single-platform project', async () => {
    await openProject(fixture('ios-3.12.capabilities.yml'))
    expect(await saveDeviceSettingsHandler(project, { runOn: 'android' })).toHaveProperty('error')
  })

  it('refuses a block that does not fit the project', async () => {
    await openProject(fixture('ios-3.12.capabilities.yml'))
    expect(
      await saveDeviceSettingsHandler(project, { block: 'ios', edit: { app: 'x' } })
    ).toHaveProperty('error')
  })

  it('refuses a path outside the active project', async () => {
    await openProject(fixture('ios-3.12.capabilities.yml'))
    const other = await mkdtemp(join(tmpdir(), 'device-settings-other-'))
    try {
      await mkdir(join(other, 'config'))
      await writeFile(
        join(other, 'config', 'capabilities.yml'),
        fixture('ios-3.12.capabilities.yml')
      )
      const result = await saveDeviceSettingsHandler(other, {
        block: 'top',
        edit: { app: 'x' }
      })
      expect(result).toHaveProperty('error')
      expect(await readFile(join(other, 'config', 'capabilities.yml'), 'utf-8')).toBe(
        fixture('ios-3.12.capabilities.yml')
      )
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })

  it('refuses non-string values, unknown keys, bad shapes and newlines', async () => {
    const original = fixture('ios-3.12.capabilities.yml')
    await openProject(original)
    const bad: unknown[] = [
      { block: 'top', edit: { app: 5 } },
      { block: 'top', edit: { automationName: 'x' } },
      { block: 'top', edit: null },
      { block: 'top', edit: { app: 'a\nb' } },
      { runOn: 'windows' },
      { block: 'nope', edit: { app: 'x' } },
      null,
      'text'
    ]
    for (const change of bad) {
      expect(await saveDeviceSettingsHandler(project, change)).toHaveProperty('error')
    }
    expect(await saveDeviceSettingsHandler(7, { runOn: 'ios' })).toHaveProperty('error')
    expect(await readFile(capsPath(), 'utf-8')).toBe(original)
  })
})
