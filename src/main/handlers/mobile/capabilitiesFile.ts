// Line-based reader for a Ruby Raider config/capabilities.yml. The file is never
// YAML-parsed: generated Android files can hold lines like `app: app:` that a parser rejects.

import type { MobilePlatform } from '@shared/types/projectLayout'
import type { DeviceEdit, DeviceFields } from '@shared/types/deviceSettings'

export type { MobilePlatform, DeviceEdit, DeviceFields }
export type BlockKey = 'top' | 'ios' | 'android'

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

/** A scalar's value: quotes removed, and an inline ` # comment` after an unquoted value dropped */
function unquote(raw: string): string {
  const value = raw.trim()
  if (value.startsWith("'")) {
    const close = value.match(/^'((?:[^']|'')*)'/)
    if (close) return close[1].replace(/''/g, "'")
  } else if (value.startsWith('"')) {
    const close = value.match(/^"((?:[^"\\]|\\.)*)"/)
    if (close) return close[1].replace(/\\(["\\])/g, '$1')
  }
  return value.replace(/(^|\s)#.*$/, '').trim()
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
  const match = configText.match(/^platform:[ \t]*([^\r\n]*)/m)
  const value = match ? unquote(match[1]).replace(/^:/, '') : ''
  return value === 'android' ? 'android' : 'ios'
}

/** Index of the block's last child line (blank and comment lines excluded), or -1 */
function lastChildLine(all: string[], at: number): number {
  const own = indentOf(all[at])
  let last = -1
  for (let i = at + 1; i < all.length; i++) {
    if (isBlank(all[i])) continue
    if (indentOf(all[i]) <= own) break
    last = i
  }
  return last
}

/**
 * Sets the given keys in a block's appium:options, as `key: 'value'`. Every other line stays
 * byte-identical, line endings included. A missing key is added as the block's last line.
 * Throws Error('newline') for a value with a line break, Error('block') for a missing block.
 */
export function writeDeviceFields(capsText: string, block: BlockKey, edit: DeviceEdit): string {
  const entries = Object.entries(edit) as Array<[string, string]>
  if (entries.some(([, value]) => /[\r\n]/.test(value))) throw new Error('newline')
  // Split on \n only, so a CRLF file's lines keep their \r
  const all = capsText.split('\n')
  const at = findOptionsLine(all, block)
  if (at === -1) throw new Error('block')
  for (const [key, value] of entries) {
    const quoted = `'${value.replace(/'/g, "''")}'`
    const end = lastChildLine(all, at)
    const cr = all[end === -1 ? at : end].endsWith('\r') ? '\r' : ''
    if (end === -1) {
      // An empty block: the key becomes its first child
      all.splice(at + 1, 0, `${' '.repeat(indentOf(all[at]) + 2)}${key}: ${quoted}${cr}`)
      continue
    }
    const first = all.slice(at + 1).findIndex((line) => !isBlank(line)) + at + 1
    const childIndent = indentOf(all[first])
    const keyLine = new RegExp(`^(\\s*)${key}:(?:\\s|$)`)
    // Only direct children, never a same-named key inside a deeper map
    let target = -1
    for (let i = first; i <= end; i++) {
      if (!isBlank(all[i]) && indentOf(all[i]) === childIndent && keyLine.test(all[i])) {
        target = i
        break
      }
    }
    if (target !== -1) {
      all[target] =
        `${' '.repeat(childIndent)}${key}: ${quoted}${all[target].endsWith('\r') ? '\r' : ''}`
    } else {
      all.splice(end + 1, 0, `${' '.repeat(childIndent)}${key}: ${quoted}${cr}`)
    }
  }
  return all.join('\n')
}

/** Sets `platform:` in config.yml, adding the line first when it is missing; null means no file */
export function writeRunOn(configText: string | null, runOn: 'ios' | 'android'): string {
  if (configText === null) return `platform: ${runOn}\n`
  if (/^platform:/m.test(configText)) {
    return configText.replace(/^platform:[^\r\n]*/m, `platform: ${runOn}`)
  }
  return `platform: ${runOn}${configText.includes('\r\n') ? '\r\n' : '\n'}${configText}`
}
