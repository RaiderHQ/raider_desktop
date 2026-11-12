// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  rubyRaiderPin,
  rubyRaiderVersion,
  supportsLoginReuse,
  supportsRuntime,
  supportsSchedules
} from '../../../src/main/handlers/logins/rubyRaiderVersion'

describe('rubyRaiderVersion', () => {
  it('reads the locked version', () => {
    expect(rubyRaiderVersion('GEM\n  specs:\n    ruby_raider (3.11.0)\n      thor\n')).toBe(
      '3.11.0'
    )
  })
  it('returns null when absent', () => {
    expect(rubyRaiderVersion('GEM\n  specs:\n    rspec (3.0.0)\n')).toBeNull()
  })
  it('ignores dependency lines', () => {
    expect(
      rubyRaiderVersion('GEM\n  specs:\n    foo (1.0.0)\n      ruby_raider (3.11.0)\n')
    ).toBeNull()
  })
})

describe('supportsLoginReuse', () => {
  it('needs 3.11.0 or later', () => {
    expect(supportsLoginReuse('3.11.0')).toBe(true)
    expect(supportsLoginReuse('4.0.0')).toBe(true)
    expect(supportsLoginReuse('3.10.2')).toBe(false)
    expect(supportsLoginReuse('2.12.0')).toBe(false)
    expect(supportsLoginReuse(null)).toBe(false)
  })
})

describe('rubyRaiderPin', () => {
  it.each([
    ["gem 'ruby_raider', '~> 3.15'\n", '3.15'],
    ['gem "ruby_raider", "~> 3.15"\n', '3.15'],
    ['gem \'ruby_raider\', "~> 4.0"\n', '4.0'],
    ["gem   'ruby_raider' ,  '~>   3.15'\n", '3.15'],
    ["  gem 'ruby_raider', '~> 3.15', require: false\n", '3.15'],
    [
      "source 'https://rubygems.org'\n\ngem 'rspec'\ngem 'ruby_raider', '~> 3.14' # pinned\n",
      '3.14'
    ],
    ["# gem 'ruby_raider', '~> 3.15'\ngem 'ruby_raider', '~> 4.0'\n", '4.0']
  ])('reads the pin from %j', (gemfile, version) => {
    expect(rubyRaiderPin(gemfile)).toBe(version)
  })

  it.each([
    ["# gem 'ruby_raider', '~> 3.15'\n"],
    ["  # gem 'ruby_raider', '~> 3.15'\n"],
    ["gem 'rspec'\ngem 'selenium-webdriver'\n"],
    ["gem 'ruby_raider'\n"],
    ["gem 'ruby_raider_extra', '~> 3.15'\n"],
    ["gem 'ruby_raider', github: 'RubyRaider/ruby_raider'\n"],
    // A floor lets bundler pick 4.x, so it names no version
    ["gem 'ruby_raider', '>= 3.11.0'\n"],
    ['']
  ])('has no pin in %j', (gemfile) => {
    expect(rubyRaiderPin(gemfile)).toBeNull()
  })

  // The text is a project's: padding must stay cheap and a version must stay short
  it('stays linear on a padded Gemfile and bounds the version it reads', () => {
    const padded = `${'\n'.repeat(256 * 1024)}${' '.repeat(50_000)}gem 'ruby_raider', '~> 3.15'\n`
    const started = Date.now()
    expect(rubyRaiderPin(padded)).toBe('3.15')
    expect(Date.now() - started).toBeLessThan(500)
    expect(rubyRaiderPin(`gem 'ruby_raider', '~> ${'9'.repeat(5000)}'\n`)).toBeNull()
    expect(rubyRaiderVersion(`    ruby_raider (${'1.'.repeat(20)}1)\n`)).toBeNull()
    expect(rubyRaiderVersion('    ruby_raider (4.0.0.pre1)\n')).toBeNull()
  })
})

describe('supportsRuntime', () => {
  it('needs 4.0 or later, unless the version is unknown', () => {
    expect(supportsRuntime('4.0.0')).toBe(true)
    expect(supportsRuntime('4.0')).toBe(true)
    expect(supportsRuntime('4.1.3')).toBe(true)
    expect(supportsRuntime('5.0.0')).toBe(true)
    expect(supportsRuntime('10.0.0')).toBe(true)
    expect(supportsRuntime('3.15.2')).toBe(false)
    expect(supportsRuntime('3.15')).toBe(false)
    expect(supportsRuntime('3.11.0')).toBe(false)
    expect(supportsRuntime('2.12.0')).toBe(false)
    expect(supportsRuntime(null)).toBe(true)
    expect(supportsRuntime('')).toBe(true)
  })
})

describe('supportsSchedules', () => {
  it.each([
    ['4.2.0', true],
    ['4.2', true],
    ['4.10.1', true],
    ['5.0.0', true],
    ['4.1.9', false],
    ['3.15.0', false],
    [null, false]
  ])('%s → %s', (version, expected) => {
    expect(supportsSchedules(version)).toBe(expected)
  })
})
