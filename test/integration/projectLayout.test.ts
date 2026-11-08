import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

import { detectProjectLayout } from '../../src/main/handlers/project/projectLayout'
import { appState } from '../../src/main/handlers/appState'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import { writeSidecar } from '../../src/main/handlers/tests/sidecar'
import { hashRuby } from '../../src/main/handlers/tests/codeHash'
import { RECORDED_MARKER } from '../../src/main/codegen/testFile'
import type { Sidecar } from '../../src/shared/types/projectTest'

let dir: string

async function project(gemfile: string | null, config?: string): Promise<void> {
  if (gemfile !== null) await writeFile(join(dir, 'Gemfile'), gemfile)
  if (config !== undefined) {
    await mkdir(join(dir, 'config'), { recursive: true })
    await writeFile(join(dir, 'config', 'config.yml'), config)
  }
}

const lock = (version: string): string =>
  `GEM\n  specs:\n    ruby_raider (${version})\n      thor\n`

async function lockFile(version: string): Promise<void> {
  await writeFile(join(dir, 'Gemfile.lock'), lock(version))
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'layout-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('detectProjectLayout', () => {
  it('selenium rspec default paths', async () => {
    await project("gem 'selenium-webdriver'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({
      framework: 'rspec',
      automation: 'selenium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      recordable: true
    })
  })

  it('reads test_id_attribute, with data-testid as the default and for an unusable value', async () => {
    await project("gem 'rspec'\n")
    expect((await detectProjectLayout(dir)).testIdAttribute).toBe('data-testid')
    await project("gem 'rspec'\n", 'test_id_attribute: data-cy\n')
    expect((await detectProjectLayout(dir)).testIdAttribute).toBe('data-cy')
    await project("gem 'rspec'\n", 'test_id_attribute: "data cy]"\n')
    expect((await detectProjectLayout(dir)).testIdAttribute).toBe('data-testid')
  })

  it('custom spec_path', async () => {
    await project("gem 'rspec'\n", 'spec_path: tests/ui\n')
    expect((await detectProjectLayout(dir)).specPath).toBe('tests/ui')
  })

  it('unsafe spec_path ignored', async () => {
    await project("gem 'rspec'\n", 'spec_path: ../outside\nfeature_path: /abs\n')
    const layout = await detectProjectLayout(dir)
    expect(layout.specPath).toBe('spec')
    expect(layout.featurePath).toBe('features')
  })

  it('an appium project is a mobile project, not supported in this version', async () => {
    await project("gem 'appium_lib'\ngem 'rspec'\n")
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({
      automation: 'selenium',
      recordable: false,
      unsupportedReason: 'mobile'
    })
    expect(layout).not.toHaveProperty('mobilePlatform')
  })

  it('minitest and capybara are not recordable', async () => {
    await project("gem 'minitest'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({ unsupportedReason: 'minitest' })
    await project("gem 'capybara'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({ unsupportedReason: 'capybara' })
  })

  it('ignores commented-out gems', async () => {
    await project("# gem 'appium_lib'\n  # gem 'watir'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({
      automation: 'selenium',
      recordable: true
    })
  })

  it('rspec-retry alone does not count as rspec', async () => {
    await project("gem 'minitest'\ngem 'rspec-retry'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({ unsupportedReason: 'minitest' })
  })

  it('root-pointing paths fall back to defaults', async () => {
    await project("gem 'rspec'\n", 'spec_path: .\nfeature_path: ./\nhelper_path: sub/..\n')
    expect(await detectProjectLayout(dir)).toMatchObject({
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers'
    })
  })

  it('a Gemfile with watir is a plain selenium layout', async () => {
    await project("gem 'watir'\ngem 'rspec'\n")
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({ automation: 'selenium', recordable: true })
    expect(layout).not.toHaveProperty('waitHelper')
  })

  it('no Gemfile', async () => {
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'noGemfile'
    })
  })
})

describe('detectProjectLayout, ruby_raider version gate', () => {
  const SELENIUM = "gem 'selenium-webdriver'\ngem 'rspec'\n"

  it('a lock below 4.0 is not recordable', async () => {
    await project(`${SELENIUM}gem 'ruby_raider'\n`)
    await lockFile('3.15.2')
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'gemTooOld',
      rubyRaiderVersion: '3.15.2'
    })
  })

  it('a 4.0 lock is recordable and reports its version', async () => {
    await project(`${SELENIUM}gem 'ruby_raider'\n`)
    await lockFile('4.0.0')
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({ recordable: true, rubyRaiderVersion: '4.0.0' })
    expect(layout).not.toHaveProperty('unsupportedReason')
  })

  it('without a lock, a Gemfile pin below 4.0 is not recordable', async () => {
    await project(`${SELENIUM}gem 'ruby_raider', '~> 3.15'\n`)
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'gemTooOld',
      rubyRaiderVersion: '3.15'
    })
  })

  it('without a lock, a 4.0 pin is recordable', async () => {
    await project(`${SELENIUM}gem 'ruby_raider', '~> 4.0'\n`)
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({ recordable: true, rubyRaiderVersion: '4.0' })
    expect(layout).not.toHaveProperty('unsupportedReason')
  })

  it('the lock wins over the Gemfile pin', async () => {
    await project(`${SELENIUM}gem 'ruby_raider', '~> 3.15'\n`)
    await lockFile('4.0.0')
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: true,
      rubyRaiderVersion: '4.0.0'
    })
    await project(`${SELENIUM}gem 'ruby_raider', '~> 4.0'\n`)
    await lockFile('3.15.2')
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'gemTooOld',
      rubyRaiderVersion: '3.15.2'
    })
  })

  it('a Gemfile naming ruby_raider without a version is given the benefit of the doubt', async () => {
    await project(`${SELENIUM}gem 'ruby_raider'\n`)
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({ recordable: true })
    expect(layout).not.toHaveProperty('rubyRaiderVersion')
    expect(layout).not.toHaveProperty('unsupportedReason')
  })

  it('a commented-out pin does not count', async () => {
    await project(`${SELENIUM}# gem 'ruby_raider', '~> 3.15'\ngem 'ruby_raider'\n`)
    const layout = await detectProjectLayout(dir)
    expect(layout).toMatchObject({ recordable: true })
    expect(layout).not.toHaveProperty('rubyRaiderVersion')
  })

  it('an appium project with an old lock stays mobile but reports its version', async () => {
    await project("gem 'appium_lib'\ngem 'rspec'\ngem 'ruby_raider'\n")
    await lockFile('3.13.0')
    expect(await detectProjectLayout(dir)).toMatchObject({
      automation: 'selenium',
      recordable: false,
      unsupportedReason: 'mobile',
      rubyRaiderVersion: '3.13.0'
    })
  })

  it('minitest and capybara keep their own reason over gemTooOld', async () => {
    await project("gem 'minitest'\ngem 'ruby_raider'\n")
    await lockFile('3.13.0')
    expect(await detectProjectLayout(dir)).toMatchObject({
      unsupportedReason: 'minitest',
      rubyRaiderVersion: '3.13.0'
    })
    await project("gem 'capybara'\ngem 'rspec'\ngem 'ruby_raider'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({
      unsupportedReason: 'capybara',
      rubyRaiderVersion: '3.13.0'
    })
  })
})

describe('setActiveProject layout', () => {
  it('activation sets automation', async () => {
    await project("gem 'selenium-webdriver'\ngem 'rspec'\n")
    const result = await setActiveProject(dir)
    expect(appState.projectAutomation).toBe('selenium')
    expect(appState.projectFramework).toBe('rspec')
    expect(appState.layout?.framework).toBe('rspec')
    expect(result.layout?.automation).toBe('selenium')
    await setActiveProject(null)
    expect(appState.layout).toBeNull()
    expect(appState.projectAutomation).toBeNull()
  })

  it('failed activation clears layout, automation and framework', async () => {
    await project("gem 'selenium-webdriver'\ngem 'rspec'\n")
    await setActiveProject(dir)
    expect(appState.layout).not.toBeNull()
    // A Gemfile that is a directory makes reading it fail with something other than ENOENT
    await rm(join(dir, 'Gemfile'))
    await mkdir(join(dir, 'Gemfile'))
    const result = await setActiveProject(dir)
    expect(result.success).toBe(false)
    expect(appState.layout).toBeNull()
    expect(appState.projectAutomation).toBeNull()
    expect(appState.projectFramework).toBeNull()
    expect(appState.projectPath).toBeNull()
  })

  it('a gemTooOld project opens, but its 3.x recorded tests are not rewritten', async () => {
    await project("gem 'selenium-webdriver'\ngem 'rspec'\ngem 'ruby_raider', '~> 3.15'\n")
    await lockFile('3.15.2')
    const file = 'spec/checkout_spec.rb'
    // The shape Raider 3.x wrote: a let(:wait) block, no runtime require
    const spec = [
      '# frozen_string_literal: true',
      '',
      `${RECORDED_MARKER} Edit in Raider; editing here makes the test code-owned.`,
      "require_relative '../helpers/spec_helper'",
      '',
      "describe 'Checkout' do",
      '  let(:wait) do',
      "    config = YAML.load_file('config/config.yml')",
      "    Selenium::WebDriver::Wait.new(timeout: config.fetch('explicit_wait', config.fetch('timeout', 10)))",
      '  end',
      '',
      "  it 'Checkout' do",
      "    driver.navigate.to('https://x.test')",
      "    wait.until { driver.find_element(css: '#go').displayed? }",
      "    driver.find_element(css: '#go').click",
      '  end',
      'end',
      ''
    ].join('\n')
    const sidecar: Sidecar = {
      version: 1,
      id: 't1',
      name: 'Checkout',
      url: 'https://x.test',
      steps: [
        { id: 'n', kind: 'navigate', url: 'https://x.test' },
        { id: 'w', kind: 'wait', element: { strategy: 'css', value: '#go' }, until: 'visible' },
        { id: 'c', kind: 'click', element: { strategy: 'css', value: '#go' } }
      ],
      file,
      hash: hashRuby(spec),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await mkdir(join(dir, 'spec'), { recursive: true })
    await writeFile(join(dir, file), spec)
    await writeSidecar(dir, sidecar)
    const sidecarPath = join(dir, '.raider', 'tests', 'spec', 'checkout_spec.rb.json')
    const before = [readFileSync(join(dir, file), 'utf-8'), readFileSync(sidecarPath, 'utf-8')]

    const result = await setActiveProject(dir)

    expect(result.success).toBe(true)
    expect(result.layout).toMatchObject({
      recordable: false,
      unsupportedReason: 'gemTooOld',
      rubyRaiderVersion: '3.15.2'
    })
    expect(appState.projectPath).toBe(dir)
    expect(appState.layout?.unsupportedReason).toBe('gemTooOld')
    expect(appState.tests.has('t1')).toBe(true)
    expect([readFileSync(join(dir, file), 'utf-8'), readFileSync(sidecarPath, 'utf-8')]).toEqual(
      before
    )
    expect(before[0]).toContain('wait.until')
    expect(JSON.parse(before[1])).not.toHaveProperty('codegen')

    // The same project once bundled on 4.0: activation rewrites the spec, so the check above has teeth
    await lockFile('4.0.0')
    const upgraded = await setActiveProject(dir)
    expect(upgraded.layout).toMatchObject({ recordable: true, rubyRaiderVersion: '4.0.0' })
    const rewritten = readFileSync(join(dir, file), 'utf-8')
    expect(rewritten).toContain("require 'ruby_raider/runtime/rspec'")
    expect(rewritten).not.toContain('wait.until')
    expect(JSON.parse(readFileSync(sidecarPath, 'utf-8'))).toHaveProperty('codegen')
    await setActiveProject(null)
  })
})
