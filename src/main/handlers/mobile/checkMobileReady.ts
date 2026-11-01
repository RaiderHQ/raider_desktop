import { get } from 'http'
import { readFile, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { safeError } from '../../utils/safeLog'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { detectMobilePlatform, readDeviceFields, readRunOn } from './capabilitiesFile'
import type { MobileReady } from '@shared/types/deviceSettings'

const APPIUM_STATUS_URL = 'http://127.0.0.1:4723/status'
const APPIUM_ADDRESS = '127.0.0.1:4723'
const NOT_OPEN = 'This project is not open.'

interface ReadyOptions {
  statusUrl?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw error
  }
}

/** True when anything answers; any status counts as a running server */
function appiumAnswers(statusUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const request = get(statusUrl, (response) => {
      response.resume()
      resolvePromise(true)
    })
    const timer = setTimeout(() => request.destroy(), timeoutMs)
    request.on('error', () => resolvePromise(false))
    request.on('close', () => clearTimeout(timer))
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path) // an iOS .app is a folder, so not isFile()
    return true
  } catch {
    return false
  }
}

/** Checks the app file, then that Appium is running. Cloud runs and non-mobile projects are ready. */
export async function checkMobileReady(
  projectPath: string,
  opts: ReadyOptions = {}
): Promise<MobileReady> {
  const { statusUrl = APPIUM_STATUS_URL, timeoutMs = 2000, env = process.env } = opts
  if (env.TEST_ENV === 'browserstack') return { ok: true }

  const caps = await readOptional(join(projectPath, 'config', 'capabilities.yml'))
  const platform = caps === null ? null : detectMobilePlatform(caps)
  if (caps === null || !platform) return { ok: true }

  const block =
    platform === 'cross_platform'
      ? readRunOn(await readOptional(join(projectPath, 'config', 'config.yml')))
      : 'top'
  const app = readDeviceFields(caps, block)?.app ?? ''
  if (app && !(await exists(resolve(projectPath, app)))) {
    return { ok: false, reason: 'app', detail: app }
  }

  if (!(await appiumAnswers(statusUrl, timeoutMs))) {
    return { ok: false, reason: 'appium', detail: APPIUM_ADDRESS }
  }
  return { ok: true }
}

/** 'check-mobile-ready': the readiness check, for the active project only */
export async function checkMobileReadyHandler(
  projectPath: unknown
): Promise<MobileReady | { error: string }> {
  await activationSettled()
  if (
    typeof projectPath !== 'string' ||
    !appState.projectPath ||
    resolve(projectPath) !== resolve(appState.projectPath)
  ) {
    return { error: NOT_OPEN }
  }
  try {
    return await checkMobileReady(appState.projectPath)
  } catch (error) {
    safeError('check-mobile-ready failed:', error)
    return { error: NOT_OPEN }
  }
}
