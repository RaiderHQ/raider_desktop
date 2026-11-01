import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  detectMobilePlatform,
  readDeviceFields,
  readRunOn
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
