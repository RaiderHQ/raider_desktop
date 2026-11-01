import { readFile, writeFile, rename, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import {
  detectMobilePlatform,
  readDeviceFields,
  readRunOn,
  writeDeviceFields,
  writeRunOn
} from './capabilitiesFile'
import type { DeviceEdit, DeviceSettings, DeviceSettingsChange } from '@shared/types/deviceSettings'

const NOT_OPEN = 'This project is not open.'
const NO_DEVICE_SETTINGS = 'The device settings could not be read.'
const NOT_SAVED = 'The device settings could not be saved.'
const EDITABLE: Array<keyof DeviceEdit> = ['deviceName', 'platformVersion', 'app']

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

/** Waits for activation, then accepts only the active project's own path */
async function activeProject(projectPath: unknown): Promise<string | null> {
  await activationSettled()
  if (typeof projectPath !== 'string' || !appState.projectPath) return null
  return resolve(projectPath) === resolve(appState.projectPath) ? appState.projectPath : null
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/** Writes through a temp file in the same folder, so a crash never leaves a half-written file */
async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temp, text)
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** 'get-device-settings': the device fields of each platform block, and which one runs */
export async function getDeviceSettingsHandler(
  projectPath: unknown
): Promise<DeviceSettings | { error: string }> {
  const project = await activeProject(projectPath)
  if (!project) return { error: NOT_OPEN }
  try {
    const caps = await readOptional(join(project, 'config', 'capabilities.yml'))
    const platform = caps === null ? null : detectMobilePlatform(caps)
    if (caps === null || !platform) return { error: NO_DEVICE_SETTINGS }
    if (platform !== 'cross_platform') {
      const fields = readDeviceFields(caps, 'top')
      return fields ? { platform, [platform]: fields } : { error: NO_DEVICE_SETTINGS }
    }
    const ios = readDeviceFields(caps, 'ios')
    const android = readDeviceFields(caps, 'android')
    if (!ios || !android) return { error: NO_DEVICE_SETTINGS }
    const config = await readOptional(join(project, 'config', 'config.yml'))
    return { platform, runOn: readRunOn(config), ios, android }
  } catch {
    return { error: NO_DEVICE_SETTINGS }
  }
}

function parseChange(change: unknown): DeviceSettingsChange | null {
  if (typeof change !== 'object' || change === null) return null
  const { block, edit, runOn } = change as Record<string, unknown>
  if (runOn !== undefined) return runOn === 'ios' || runOn === 'android' ? { runOn } : null
  if (block !== 'top' && block !== 'ios' && block !== 'android') return null
  if (typeof edit !== 'object' || edit === null || Array.isArray(edit)) return null
  const clean: DeviceEdit = {}
  for (const [key, value] of Object.entries(edit)) {
    if (!EDITABLE.includes(key as keyof DeviceEdit) || typeof value !== 'string') return null
    clean[key as keyof DeviceEdit] = value
  }
  return { block, edit: clean }
}

/** 'save-device-settings': one device edit, or which platform a cross-platform project runs on */
export async function saveDeviceSettingsHandler(
  projectPath: unknown,
  change: unknown
): Promise<{ ok: true } | { error: string }> {
  const project = await activeProject(projectPath)
  if (!project) return { error: NOT_OPEN }
  const parsed = parseChange(change)
  if (!parsed) return { error: NOT_SAVED }
  try {
    const capsPath = join(project, 'config', 'capabilities.yml')
    const caps = await readOptional(capsPath)
    const platform = caps === null ? null : detectMobilePlatform(caps)
    if (caps === null || !platform) return { error: NOT_SAVED }
    if ('runOn' in parsed) {
      if (platform !== 'cross_platform') return { error: NOT_SAVED }
      const configPath = join(project, 'config', 'config.yml')
      await writeAtomic(configPath, writeRunOn(await readOptional(configPath), parsed.runOn))
      return { ok: true }
    }
    // A single-platform file has only its top block; a cross-platform one only ios and android
    if ((platform === 'cross_platform') === (parsed.block === 'top')) return { error: NOT_SAVED }
    await writeAtomic(capsPath, writeDeviceFields(caps, parsed.block, parsed.edit))
    return { ok: true }
  } catch {
    return { error: NOT_SAVED }
  }
}
