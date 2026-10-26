import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

import { detectProjectLayout } from '../../src/main/handlers/project/projectLayout'
import { appState } from '../../src/main/handlers/appState'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'

let dir: string

async function project(gemfile: string | null, config?: string): Promise<void> {
  if (gemfile !== null) await writeFile(join(dir, 'Gemfile'), gemfile)
  if (config !== undefined) {
    await mkdir(join(dir, 'config'), { recursive: true })
    await writeFile(join(dir, 'config', 'config.yml'), config)
  }
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

  it('watir cucumber', async () => {
    await project("gem \"watir\"\ngem 'cucumber'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({
      framework: 'cucumber',
      automation: 'watir',
      recordable: true
    })
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

  it('appium is not recordable', async () => {
    await project("gem 'appium_lib'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'mobile'
    })
  })

  it('minitest and capybara are not recordable', async () => {
    await project("gem 'minitest'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({ unsupportedReason: 'minitest' })
    await project("gem 'capybara'\ngem 'rspec'\n")
    expect(await detectProjectLayout(dir)).toMatchObject({ unsupportedReason: 'capybara' })
  })

  it('no Gemfile', async () => {
    expect(await detectProjectLayout(dir)).toMatchObject({
      recordable: false,
      unsupportedReason: 'noGemfile'
    })
  })
})

describe('setActiveProject layout', () => {
  it('activation sets automation', async () => {
    await project("gem 'watir'\ngem 'rspec'\n")
    const result = await setActiveProject(dir)
    expect(appState.projectAutomation).toBe('watir')
    expect(appState.projectFramework).toBe('rspec')
    expect(appState.layout?.framework).toBe('rspec')
    expect(result.layout?.automation).toBe('watir')
    await setActiveProject(null)
    expect(appState.layout).toBeNull()
    expect(appState.projectAutomation).toBeNull()
  })
})
