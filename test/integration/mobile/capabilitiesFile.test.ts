import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  detectMobilePlatform,
  readDeviceFields,
  readRunOn,
  writeDeviceFields,
  writeRunOn
} from '../../../src/main/handlers/mobile/capabilitiesFile'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'mobile', name), 'utf-8')

const VERSIONS = ['3.11', '3.12']
const KINDS = ['ios', 'android', 'cross_platform'] as const

describe('detectMobilePlatform', () => {
  for (const version of VERSIONS) {
    for (const kind of KINDS) {
      it(`detects ${kind} from the ${version} file`, () => {
        expect(detectMobilePlatform(fixture(`${kind}-${version}.capabilities.yml`))).toBe(kind)
      })
    }
  }

  it('gives null for an empty file', () => {
    expect(detectMobilePlatform('')).toBeNull()
  })

  it('gives null when only browserstack is present', () => {
    expect(detectMobilePlatform('browserstack:\n  platformName: iOS\n')).toBeNull()
  })
})

describe('readDeviceFields', () => {
  it('reads the iOS top block', () => {
    expect(readDeviceFields(fixture('ios-3.11.capabilities.yml'), 'top')).toEqual({
      deviceName: 'iPhone 15',
      platformVersion: '17.0',
      app: 'RaiderTestApp.app',
      automationName: 'XCUITest'
    })
  })

  it('reads the Android top block despite the doubled app: line under browserstack', () => {
    const text = fixture('android-3.11.capabilities.yml')
    expect(text).toContain('app: app:')
    expect(readDeviceFields(text, 'top')).toEqual({
      deviceName: 'Pixel 8 API 34',
      platformVersion: '14',
      app: 'app-release.apk',
      automationName: 'UiAutomator2'
    })
  })

  it('reads each block of a cross-platform file and has no top block', () => {
    const text = fixture('cross_platform-3.12.capabilities.yml')
    expect(readDeviceFields(text, 'android')).toEqual({
      deviceName: 'Pixel 8 API 34',
      platformVersion: '14',
      app: 'app-release.apk',
      automationName: 'UiAutomator2'
    })
    expect(readDeviceFields(text, 'ios')).toEqual({
      deviceName: 'iPhone 15',
      platformVersion: '17.0',
      app: 'RaiderTestApp.app',
      automationName: 'XCUITest'
    })
    expect(readDeviceFields(text, 'top')).toBeNull()
  })

  it('unquotes quoted values and unescapes doubled single quotes', () => {
    const text = [
      'appium:options:',
      "  deviceName: 'Bob''s phone'",
      '  platformVersion: "16.1"',
      '  app: plain.apk',
      "  automationName: 'XCUITest'",
      ''
    ].join('\n')
    expect(readDeviceFields(text, 'top')).toEqual({
      deviceName: "Bob's phone",
      platformVersion: '16.1',
      app: 'plain.apk',
      automationName: 'XCUITest'
    })
  })
})

describe('readRunOn', () => {
  it('reads symbol and bare values', () => {
    expect(readRunOn('platform: :ios\n')).toBe('ios')
    expect(readRunOn('platform: android\n')).toBe('android')
    expect(readRunOn('platform: :android')).toBe('android')
  })

  it('defaults to ios when the file or line is missing', () => {
    expect(readRunOn(null)).toBe('ios')
    expect(readRunOn('timeout: 10\n')).toBe('ios')
  })

  it('reads the generated cross-platform configs', () => {
    expect(readRunOn(fixture('cross_platform-3.11.config.yml'))).toBe('ios')
    expect(readRunOn(fixture('cross_platform-3.12.config.yml'))).toBe('ios')
  })
})

describe('reader details', () => {
  it('drops an inline comment after an unquoted value but keeps # inside quotes', () => {
    const text = [
      'appium:options:',
      '  deviceName: Pixel 8 # my phone',
      "  platformVersion: '14' # quoted",
      '  app: "a #1.apk" # note',
      '  automationName: UiAutomator2#x',
      ''
    ].join('\n')
    expect(readDeviceFields(text, 'top')).toEqual({
      deviceName: 'Pixel 8',
      platformVersion: '14',
      app: 'a #1.apk',
      automationName: 'UiAutomator2#x'
    })
  })

  it('reads a CRLF file like its LF twin', () => {
    const text = fixture('cross_platform-3.12.capabilities.yml')
    const crlf = text.replace(/\n/g, '\r\n')
    expect(detectMobilePlatform(crlf)).toBe('cross_platform')
    expect(readDeviceFields(crlf, 'ios')).toEqual(readDeviceFields(text, 'ios'))
    expect(readDeviceFields(crlf, 'android')).toEqual(readDeviceFields(text, 'android'))
  })

  it('reads quoted run-on values', () => {
    expect(readRunOn("platform: 'android'\n")).toBe('android')
    expect(readRunOn('platform: "android"\n')).toBe('android')
    expect(readRunOn("platform: ':ios'\n")).toBe('ios')
    expect(readRunOn('platform: android # on this one\n')).toBe('android')
  })
})

const EDITABLE = ['deviceName', 'platformVersion', 'app'] as const

describe('writeDeviceFields', () => {
  const cases: Array<[string, string, 'top' | 'ios' | 'android']> = []
  for (const version of VERSIONS) {
    cases.push([`ios-${version}.capabilities.yml`, version, 'top'])
    cases.push([`android-${version}.capabilities.yml`, version, 'top'])
    cases.push([`cross_platform-${version}.capabilities.yml`, version, 'ios'])
    cases.push([`cross_platform-${version}.capabilities.yml`, version, 'android'])
  }

  for (const [name, , block] of cases) {
    for (const key of EDITABLE) {
      it(`changes only the ${key} line of ${name} (${block})`, () => {
        const before = fixture(name)
        const after = writeDeviceFields(before, block, { [key]: 'New value' })
        const a = before.split('\n')
        const b = after.split('\n')
        expect(b).toHaveLength(a.length)
        const changed = b.map((line, i) => (line === a[i] ? -1 : i)).filter((i) => i >= 0)
        expect(changed).toHaveLength(1)
        expect(b[changed[0]]).toMatch(new RegExp(`^\\s+${key}: 'New value'$`))
        expect(readDeviceFields(after, block)?.[key]).toBe('New value')
      })
    }
  }

  it('keeps CRLF on every line', () => {
    const crlf = fixture('cross_platform-3.12.capabilities.yml').replace(/\n/g, '\r\n')
    const after = writeDeviceFields(crlf, 'ios', { deviceName: 'iPhone 16', app: 'x.app' })
    expect(after.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(readDeviceFields(after, 'ios')).toMatchObject({ deviceName: 'iPhone 16', app: 'x.app' })
    const changed = after.split('\r\n').filter((line, i) => line !== crlf.split('\r\n')[i])
    expect(changed).toHaveLength(2)
  })

  it('adds a missing key as the last line of its block at the child indentation', () => {
    const text = [
      'platformName: iOS',
      'appium:options:',
      '  automationName: XCUITest',
      '',
      'other:',
      '  a: 1',
      ''
    ].join('\n')
    const after = writeDeviceFields(text, 'top', { deviceName: 'iPhone 15' })
    expect(after).toBe(
      [
        'platformName: iOS',
        'appium:options:',
        '  automationName: XCUITest',
        "  deviceName: 'iPhone 15'",
        '',
        'other:',
        '  a: 1',
        ''
      ].join('\n')
    )
  })

  it('adds a missing key inside a nested block of a CRLF file', () => {
    const text =
      'ios:\r\n  platformName: iOS\r\n  appium:options:\r\n    app: a.app\r\nandroid:\r\n  x: 1\r\n'
    const after = writeDeviceFields(text, 'ios', { deviceName: 'P' })
    expect(after).toBe(
      "ios:\r\n  platformName: iOS\r\n  appium:options:\r\n    app: a.app\r\n    deviceName: 'P'\r\nandroid:\r\n  x: 1\r\n"
    )
  })

  it('round-trips awkward values', () => {
    for (const value of ['Pixel 8 #2: test', "O'Brien's iPhone"]) {
      const after = writeDeviceFields(fixture('ios-3.12.capabilities.yml'), 'top', {
        deviceName: value
      })
      expect(readDeviceFields(after, 'top')?.deviceName).toBe(value)
    }
  })

  it('refuses a newline in a value', () => {
    expect(() =>
      writeDeviceFields(fixture('ios-3.12.capabilities.yml'), 'top', { app: 'a\nb' })
    ).toThrow('newline')
    expect(() =>
      writeDeviceFields(fixture('ios-3.12.capabilities.yml'), 'top', { app: 'a\rb' })
    ).toThrow('newline')
  })

  it('throws when the block does not exist', () => {
    expect(() =>
      writeDeviceFields(fixture('ios-3.12.capabilities.yml'), 'android', { app: 'a' })
    ).toThrow('block')
  })
})

describe('writeDeviceFields edge cases', () => {
  it('adds a key to an empty options block as its first child', () => {
    const text = 'platformName: iOS\nappium:options:\n\nother: 1\n'
    expect(writeDeviceFields(text, 'top', { app: 'a.app' })).toBe(
      "platformName: iOS\nappium:options:\n  app: 'a.app'\n\nother: 1\n"
    )
  })

  it('never edits a same-named key inside a deeper map', () => {
    const text = [
      'appium:options:',
      '  extra:',
      '    app: nested.apk',
      '  deviceName: Pixel',
      ''
    ].join('\n')
    expect(writeDeviceFields(text, 'top', { app: 'real.apk' })).toBe(
      [
        'appium:options:',
        '  extra:',
        '    app: nested.apk',
        '  deviceName: Pixel',
        "  app: 'real.apk'",
        ''
      ].join('\n')
    )
  })
})

describe('writeRunOn', () => {
  it('creates the file content when there is none', () => {
    expect(writeRunOn(null, 'android')).toBe('platform: android\n')
  })

  it('replaces the platform line and leaves the rest alone', () => {
    expect(writeRunOn('platform: :ios\ntimeout: 10\n', 'android')).toBe(
      'platform: android\ntimeout: 10\n'
    )
  })

  it('prepends a platform line when there is none', () => {
    expect(writeRunOn('timeout: 10\nvideo:\n  fps: 5\n', 'ios')).toBe(
      'platform: ios\ntimeout: 10\nvideo:\n  fps: 5\n'
    )
  })

  it('keeps CRLF', () => {
    expect(writeRunOn('platform: :ios\r\ntimeout: 10\r\n', 'android')).toBe(
      'platform: android\r\ntimeout: 10\r\n'
    )
    expect(writeRunOn('timeout: 10\r\n', 'android')).toBe('platform: android\r\ntimeout: 10\r\n')
  })

  it('only changes the platform line of the generated config', () => {
    const before = fixture('cross_platform-3.12.config.yml')
    const after = writeRunOn(before, 'android')
    expect(readRunOn(after)).toBe('android')
    const a = before.split('\n')
    const b = after.split('\n')
    expect(b.filter((line, i) => line !== a[i])).toEqual(['platform: android'])
  })
})
