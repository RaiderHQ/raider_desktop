// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: (): string => '/' }, BrowserWindow: class {} }))
vi.mock('../../src/main/utils/safeExec', () => ({ safeExec: vi.fn() }))
vi.mock('../../src/main/handlers/project/setActiveProject', () => ({
  default: vi.fn(),
  activationSettled: vi.fn().mockResolvedValue(undefined)
}))

import { appState } from '../../src/main/handlers/appState'
import { safeExec } from '../../src/main/utils/safeExec'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import { repinGemfile, upgradeRubyRaider } from '../../src/main/handlers/project/upgradeRubyRaider'
import type { ProjectLayout } from '../../src/shared/types/projectLayout'

const exec = vi.mocked(safeExec)
const activate = vi.mocked(setActiveProject)

const OLD_GEMFILE = [
  "source 'https://rubygems.org'",
  '',
  "gem 'rspec'",
  "gem 'ruby_raider', '~> 3.15'",
  "gem 'selenium-webdriver', '~> 4.20'",
  ''
].join('\n')
const NEW_GEMFILE = OLD_GEMFILE.replace("'~> 3.15'", "'~> 4.0'")

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true,
  rubyRaiderVersion: '4.0.0'
}

const ok = { stdout: 'Bundle updated!\n', stderr: '', exitCode: 0 }

let dir: string
const gemfile = (): Promise<string> => readFile(join(dir, 'Gemfile'), 'utf-8')

describe('repinGemfile', () => {
  it.each([
    ["gem 'ruby_raider', '~> 3.15'\n", "gem 'ruby_raider', '~> 4.0'\n"],
    ['gem "ruby_raider", "~> 3.15"\n', 'gem "ruby_raider", "~> 4.0"\n'],
    ['gem \'ruby_raider\', "~> 3.15"\n', 'gem \'ruby_raider\', "~> 4.0"\n'],
    ["gem 'ruby_raider', '>= 3.11.0'\n", "gem 'ruby_raider', '~> 4.0'\n"],
    ["gem 'ruby_raider', '~> 4.0'\n", "gem 'ruby_raider', '~> 4.0'\n"],
    ["gem 'ruby_raider', '~> 3.15' # web\n", "gem 'ruby_raider', '~> 4.0' # web\n"],
    [
      "gem 'ruby_raider', '~> 3.15', require: false\n",
      "gem 'ruby_raider', '~> 4.0', require: false\n"
    ],
    ["  gem 'ruby_raider',  '~> 3.15'\n", "  gem 'ruby_raider',  '~> 4.0'\n"],
    ["gem 'ruby_raider', '~> 3.15'", "gem 'ruby_raider', '~> 4.0'"],
    [
      "# gem 'ruby_raider', '~> 3.15'\ngem 'ruby_raider', '~> 3.14'\n",
      "# gem 'ruby_raider', '~> 3.15'\ngem 'ruby_raider', '~> 4.0'\n"
    ]
  ])('repins %j', (before, after) => {
    expect(repinGemfile(before)).toBe(after)
  })

  it('leaves everything but the pin byte for byte', () => {
    const before = [
      "source 'https://rubygems.org'\r",
      '',
      '\tgem "rspec", "~> 3.13"',
      "gem 'ruby_raider_extra', '~> 1.0'",
      "gem 'ruby_raider', '~> 3.15'",
      "gem 'selenium-webdriver',   '~> 4.20'  # browser",
      '',
      ''
    ].join('\n')
    const after = repinGemfile(before)
    expect(after).not.toBeNull()
    const beforeLines = before.split('\n')
    const afterLines = (after as string).split('\n')
    expect(afterLines).toHaveLength(beforeLines.length)
    beforeLines.forEach((line, i) => {
      if (i === 4) expect(afterLines[i]).toBe("gem 'ruby_raider', '~> 4.0'")
      else expect(afterLines[i]).toBe(line)
    })
  })

  it.each([
    ["# gem 'ruby_raider', '~> 3.15'\n"],
    ["  # gem 'ruby_raider', '~> 3.15'\ngem 'rspec'\n"],
    ["gem 'rspec'\ngem 'selenium-webdriver'\n"],
    ["gem 'ruby_raider_extra', '~> 3.15'\n"],
    ['']
  ])('has nothing to repin in %j', (text) => {
    expect(repinGemfile(text)).toBe('noLine')
  })

  it.each([
    ["gem 'ruby_raider', '>= 3', '< 4'\n"],
    ["gem 'ruby_raider', '~> 3.15', # note\n  '< 4'\n"],
    ["gem 'ruby_raider', '~> 3.15',\n  '< 4'\n"],
    // A requirement continued on the next line after a bare-looking line
    ["gem 'ruby_raider',\n  '~> 3.0'\n"]
  ])('refuses a pin with several requirements %j', (text) => {
    expect(repinGemfile(text)).toBe('severalRequirements')
  })

  it.each([
    ["gem 'ruby_raider', :require => false\n", "gem 'ruby_raider', '~> 4.0', :require => false\n"],
    ["gem 'ruby_raider',\n  require: false\n", "gem 'ruby_raider', '~> 4.0',\n  require: false\n"]
  ])('adds the requirement before hash-rocket or continued options %j', (text, expected) => {
    expect(repinGemfile(text)).toBe(expected)
  })

  // A bare line names no version: the lock alone held the gem back, so the line gets one
  it.each([
    ["gem 'ruby_raider'\n", "gem 'ruby_raider', '~> 4.0'\n"],
    ['gem "ruby_raider"\n', 'gem "ruby_raider", "~> 4.0"\n'],
    ["gem 'ruby_raider' # trace\n", "gem 'ruby_raider', '~> 4.0' # trace\n"],
    ["gem 'ruby_raider', require: false\n", "gem 'ruby_raider', '~> 4.0', require: false\n"],
    ["  gem 'ruby_raider'", "  gem 'ruby_raider', '~> 4.0'"]
  ])('adds the requirement to a bare line %j', (text, expected) => {
    expect(repinGemfile(text)).toBe(expected)
  })
})

describe('upgradeRubyRaider', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'upgrade-'))
    await writeFile(join(dir, 'Gemfile'), OLD_GEMFILE)
    appState.projectPath = dir
    appState.layout = { ...layout, recordable: false, unsupportedReason: 'gemTooOld' }
    exec.mockReset()
    activate.mockReset()
    exec.mockResolvedValue(ok)
    activate.mockResolvedValue({ success: true, layout })
  })

  afterEach(async () => {
    appState.projectPath = null
    appState.layout = null
    await rm(dir, { recursive: true, force: true })
  })

  describe('refusals', () => {
    it('refuses a mobile (Appium) project', async () => {
      appState.layout = { ...layout, recordable: false, unsupportedReason: 'mobile' }
      expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
        success: false,
        error: 'Mobile projects are not supported in this version.'
      })
    })

    it('only updates the open project', async () => {
      expect(await upgradeRubyRaider(join(dir, 'other'), 'ruby')).toEqual({
        success: false,
        error: 'Only the open project can be updated.'
      })
      expect(await upgradeRubyRaider(undefined, 'ruby')).toEqual({
        success: false,
        error: 'Only the open project can be updated.'
      })
      appState.projectPath = null
      expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
        success: false,
        error: 'Only the open project can be updated.'
      })
    })

    it('refuses a Ruby command that could smuggle shell syntax', async () => {
      expect(await upgradeRubyRaider(dir, 'ruby; rm -rf /')).toEqual({
        success: false,
        error: 'Invalid Ruby command.'
      })
      expect(await upgradeRubyRaider(dir, 42)).toEqual({
        success: false,
        error: 'Invalid Ruby command.'
      })
    })

    it('refuses a project without a Gemfile', async () => {
      await rm(join(dir, 'Gemfile'))
      expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
        success: false,
        error: 'The project has no Gemfile.'
      })
      expect(existsSync(join(dir, 'Gemfile'))).toBe(false)
    })

    it('refuses a Gemfile over 1 MiB', async () => {
      await writeFile(join(dir, 'Gemfile'), `${OLD_GEMFILE}${'#'.repeat(1024 * 1024)}\n`)
      expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
        success: false,
        error: 'The Gemfile is too large.'
      })
    })

    it('refuses a Gemfile with no active pin line', async () => {
      const unpinned = "gem 'rspec'\n# gem 'ruby_raider', '~> 3.15'\ngem 'ruby_raider_extra'\n"
      await writeFile(join(dir, 'Gemfile'), unpinned)
      expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
        success: false,
        error: "The Gemfile has no gem 'ruby_raider' line to update."
      })
      expect(await gemfile()).toBe(unpinned)
    })

    afterEach(() => {
      expect(exec).not.toHaveBeenCalled()
      expect(activate).not.toHaveBeenCalled()
    })
  })

  it('repins the Gemfile, runs bundle update and reactivates the project', async () => {
    const result = await upgradeRubyRaider(dir, 'ruby')

    expect(await gemfile()).toBe(NEW_GEMFILE)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith(
      'ruby -S bundle update ruby_raider',
      expect.objectContaining({ cwd: dir, timeout: 300_000 })
    )
    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate).toHaveBeenCalledWith(dir)
    expect(result).toEqual({ success: true, layout, output: 'Bundle updated!\n' })
  })

  it('runs one update at a time', async () => {
    let finish: (value: { exitCode: number; stdout: string; stderr: string }) => void = () => {}
    exec.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }) as never
    )
    const first = upgradeRubyRaider(dir, 'ruby')
    expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
      success: false,
      error: 'An update is already running.'
    })
    finish({ exitCode: 0, stdout: 'done', stderr: '' })
    expect((await first).success).toBe(true)
    expect(exec).toHaveBeenCalledTimes(1)
    // Settled: the next call runs
    await upgradeRubyRaider(dir, 'ruby')
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('names the several-requirements case instead of saying there is no line', async () => {
    await writeFile(join(dir, 'Gemfile'), "gem 'ruby_raider', '>= 3', '< 4'\n")
    const result = await upgradeRubyRaider(dir, 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('more than one requirement')
    expect(exec).not.toHaveBeenCalled()
  })

  it('passes the chosen Ruby through to bundle', async () => {
    const rbenv = 'eval "$(rbenv init -)" && rbenv shell 3.3.0 && ruby'
    expect((await upgradeRubyRaider(dir, rbenv)).success).toBe(true)
    expect(exec.mock.calls[0][0]).toBe(`${rbenv} -S bundle update ruby_raider`)
  })

  it('does not rewrite a Gemfile that is already on 4.0', async () => {
    await writeFile(join(dir, 'Gemfile'), NEW_GEMFILE)
    const result = await upgradeRubyRaider(dir, 'ruby')
    expect(result.success).toBe(true)
    expect(await gemfile()).toBe(NEW_GEMFILE)
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('reports a failed bundle update and leaves the Gemfile repinned', async () => {
    exec.mockResolvedValue({ stdout: 'Fetching gem metadata\n', stderr: 'boom', exitCode: 1 })

    const result = await upgradeRubyRaider(dir, 'ruby')

    expect(result).toEqual({ success: false, error: 'boom', output: 'Fetching gem metadata\n' })
    expect(activate).not.toHaveBeenCalled()
    expect(await gemfile()).toBe(NEW_GEMFILE)
  })

  it('falls back to stdout, then a generic message, when stderr is empty', async () => {
    exec.mockResolvedValue({ stdout: 'Could not find gem\n', stderr: '  ', exitCode: 7 })
    expect(await upgradeRubyRaider(dir, 'ruby')).toMatchObject({
      success: false,
      error: 'Could not find gem'
    })
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 7 })
    expect(await upgradeRubyRaider(dir, 'ruby')).toMatchObject({
      success: false,
      error: 'bundle update ruby_raider failed (exit code 7).'
    })
  })

  it('reports a timed-out bundle update', async () => {
    exec.mockResolvedValue({ stdout: 'partial', stderr: 'Command timed out', exitCode: null })
    expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
      success: false,
      error: 'bundle update ruby_raider timed out. Run it in the project folder.',
      output: 'partial'
    })
    expect(activate).not.toHaveBeenCalled()
  })

  it('does not reactivate a project that was switched away from during the update', async () => {
    exec.mockImplementation(async () => {
      appState.projectPath = '/somewhere/else'
      return ok
    })

    const result = await upgradeRubyRaider(dir, 'ruby')

    expect(result).toEqual({ success: true, output: 'Bundle updated!\n' })
    expect(result).not.toHaveProperty('layout')
    expect(activate).not.toHaveBeenCalled()
    expect(await gemfile()).toBe(NEW_GEMFILE)
  })

  it('surfaces a failed reactivation', async () => {
    activate.mockResolvedValue({ success: false, error: 'Could not read the project.' })
    expect(await upgradeRubyRaider(dir, 'ruby')).toEqual({
      success: false,
      error: 'Could not read the project.',
      output: 'Bundle updated!\n'
    })
  })
})
