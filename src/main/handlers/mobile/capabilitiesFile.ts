// Line-based reader for a Ruby Raider config/capabilities.yml. The file is never
// YAML-parsed: generated Android files can hold lines like `app: app:` that a parser rejects.

import type { MobilePlatform } from '@shared/types/projectLayout'

export type { MobilePlatform }
export type BlockKey = 'top' | 'ios' | 'android'

export interface DeviceFields {
  deviceName: string
  platformVersion: string
  app: string
  automationName: string
}

const FIELDS: Array<[keyof DeviceFields, string]> = [
  ['deviceName', 'deviceName'],
  ['platformVersion', 'platformVersion'],
  ['app', 'app'],
  ['automationName', 'automationName']
]

const indentOf = (line: string): number => line.length - line.trimStart().length
const isBlank = (line: string): boolean => line.trim() === '' || line.trimStart().startsWith('#')

function lines(text: string): string[] {
  return text.split(/\r?\n/)
}

function unquote(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  return value
}

/** Line index of `appium:options:` for the block, or -1 */
function findOptionsLine(all: string[], block: BlockKey): number {
  if (block === 'top') return all.findIndex((line) => /^appium:options:\s*$/.test(line))
  const start = all.findIndex((line) => new RegExp(`^${block}:\\s*$`).test(line))
  if (start === -1) return -1
  for (let i = start + 1; i < all.length; i++) {
    if (isBlank(all[i])) continue
    if (indentOf(all[i]) === 0) return -1
    if (/^\s+appium:options:\s*$/.test(all[i])) return i
  }
  return -1
}

export function detectMobilePlatform(capsText: string): MobilePlatform | null {
  const all = lines(capsText)
  const hasIos = findOptionsLine(all, 'ios') !== -1
  const hasAndroid = findOptionsLine(all, 'android') !== -1
  if (hasIos && hasAndroid) return 'cross_platform'
  if (findOptionsLine(all, 'top') === -1) return null
  const platform = all.find((line) => /^platformName:/.test(line))
  const name = platform ? unquote(platform.slice('platformName:'.length)).toLowerCase() : ''
  return name === 'android' ? 'android' : 'ios'
}

export function readDeviceFields(capsText: string, block: BlockKey): DeviceFields | null {
  const all = lines(capsText)
  const at = findOptionsLine(all, block)
  if (at === -1) return null
  const own = indentOf(all[at])
  const found: Record<string, string> = {}
  for (let i = at + 1; i < all.length; i++) {
    if (isBlank(all[i])) continue
    if (indentOf(all[i]) <= own) break
    const match = all[i].match(/^\s*([A-Za-z_:.]+):(?:\s(.*))?$/)
    if (match && !(match[1] in found)) found[match[1]] = unquote(match[2] ?? '')
  }
  const fields = { deviceName: '', platformVersion: '', app: '', automationName: '' }
  for (const [key, name] of FIELDS) fields[key] = found[name] ?? ''
  return fields
}

export function readRunOn(configText: string | null): 'ios' | 'android' {
  if (configText === null) return 'ios'
  const match = configText.match(/^platform:\s*:?(\w+)/m)
  return match && match[1] === 'android' ? 'android' : 'ios'
}
