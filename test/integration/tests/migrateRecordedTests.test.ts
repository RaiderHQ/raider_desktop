import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { migrateRecordedTests } from '../../../src/main/handlers/tests/migrateRecordedTests'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar, writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import { hashRuby } from '../../../src/main/handlers/tests/codeHash'
import { CODEGEN_VERSION, RECORDED_MARKER } from '../../../src/main/codegen/testFile'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Sidecar } from '../../../src/shared/types/projectTest'
import type { Step } from '../../../src/shared/types/step'

let project: string

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const steps: Step[] = [
  { id: 'n', kind: 'navigate', url: 'https://x.test' },
  { id: 'w', kind: 'wait', element: { strategy: 'css', value: '#go' }, until: 'visible' },
  { id: 'c', kind: 'click', element: { strategy: 'css', value: '#go' } }
]

// The shape Raider 3.x wrote for these steps: a let(:wait) and wait.until lines
const OLD_SPEC = [
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
  "    wait.until { driver.find_element(css: '#go').displayed? }",
  "    driver.find_element(css: '#go').click",
  '  end',
  'end',
  ''
].join('\n')

const FILE = 'spec/checkout_spec.rb'
const specPath = (): string => join(project, FILE)
const sidecarPath = (): string => join(project, '.raider', 'tests', 'spec', 'checkout_spec.rb.json')

/** A 3.x sidecar for the spec on disk: no codegen, hash of the file as written. */
const oldSidecar = (content: string, over: Partial<Sidecar> = {}): Sidecar => ({
  version: 1,
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  steps,
  file: FILE,
  hash: hashRuby(content),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over
})

async function writeOldProject(over: Partial<Sidecar> = {}): Promise<void> {
  await mkdir(join(project, 'spec'), { recursive: true })
  await writeFile(specPath(), OLD_SPEC)
  await writeSidecar(project, oldSidecar(OLD_SPEC, over))
}

const snapshot = async (): Promise<[string, string, number]> => [
  await readFile(specPath(), 'utf-8'),
  await readFile(sidecarPath(), 'utf-8'),
  (await fs.stat(specPath())).mtimeMs
]

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-migrate-'))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('migrateRecordedTests', () => {
  it('rewrites a 3.x spec to the 4.0 shape and stamps the sidecar', async () => {
    await writeOldProject()

    expect(await migrateRecordedTests(project, layout)).toBe(1)

    const content = await readFile(specPath(), 'utf-8')
    expect(content).toContain("require 'ruby_raider/runtime/rspec'")
    expect(content).toContain('include Raider::Matchers')
    expect(content).toContain("expect { driver.find_element(css: '#go') }.to be_visible")
    expect(content).toContain("driver.find_element(css: '#go').click")
    expect(content).not.toContain('wait.until')
    expect(content).not.toContain('let(:wait)')
    const sidecar = await readSidecar(project, FILE)
    expect(sidecar?.codegen).toBe(CODEGEN_VERSION)
    expect(sidecar?.codegen).toBe(2)
    expect(sidecar?.hash).toBe(hashRuby(content))
    expect(sidecar?.codeOwned).toBeUndefined()
    expect(sidecar?.steps).toEqual(steps)
    expect(sidecar?.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(sidecar?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('leaves a code-owned test alone', async () => {
    await writeOldProject({ codeOwned: true })
    const before = await snapshot()

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    expect(await snapshot()).toEqual(before)
  })

  it('marks a hand-edited file code-owned and leaves it untouched', async () => {
    await writeOldProject()
    const edited = `${OLD_SPEC}puts 'hand edit'\n`
    await writeFile(specPath(), edited)

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    expect(await readFile(specPath(), 'utf-8')).toBe(edited)
    const sidecar = await readSidecar(project, FILE)
    expect(sidecar?.codeOwned).toBe(true)
    expect(sidecar?.codegen).toBeUndefined()
  })

  it('does not rewrite a test already at the current codegen', async () => {
    const saved = await saveRecordedTest(project, layout, {
      id: 't1',
      name: 'Checkout',
      url: 'https://x.test',
      steps
    })
    expect(saved.codegen).toBe(CODEGEN_VERSION)
    const before = await snapshot()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    expect(await snapshot()).toEqual(before)
  })

  it('does nothing in a project that is not recordable', async () => {
    await writeOldProject()
    const before = await snapshot()

    expect(
      await migrateRecordedTests(project, {
        ...layout,
        recordable: false,
        unsupportedReason: 'capybara'
      })
    ).toBe(0)

    expect(await snapshot()).toEqual(before)
  })
})

describe('migrateRecordedTests leaves alone', () => {
  it('a sidecar at a path that is not a spec file: nothing is created for it', async () => {
    await mkdir(join(project, 'spec'), { recursive: true })
    await writeFile(join(project, 'spec', 'notes.rb'), OLD_SPEC)
    await writeSidecar(project, oldSidecar(OLD_SPEC, { file: 'spec/notes.rb' }))

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    expect(await readFile(join(project, 'spec', 'notes.rb'), 'utf-8')).toBe(OLD_SPEC)
    await expect(fs.stat(join(project, 'spec', 'notes_spec.rb'))).rejects.toThrow()
    const written = await fs.readdir(join(project, '.raider', 'tests', 'spec'))
    expect(written).toEqual(['notes.rb.json'])
  })

  it('a sidecar whose spec file is missing: an open never creates a file', async () => {
    await writeOldProject()
    await rm(specPath())

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    await expect(fs.stat(specPath())).rejects.toThrow()
    const sidecar = await readSidecar(project, FILE)
    expect(sidecar?.codegen).toBeUndefined()
  })

  it('a sidecar from a newer Raider (codegen above the current shape)', async () => {
    await writeOldProject({ codegen: CODEGEN_VERSION + 1 })
    const before = await snapshot()

    expect(await migrateRecordedTests(project, layout)).toBe(0)

    expect(await snapshot()).toEqual(before)
  })
})

describe('migrateRecordedTests with force (the test id attribute changed)', () => {
  const testIdSteps: Step[] = [
    { id: 'n', kind: 'navigate', url: 'https://x.test' },
    {
      id: 'c',
      kind: 'click',
      element: {
        strategy: 'css',
        value: '[data-testid="go"]',
        locator: { by: 'testId', attribute: 'data-testid', value: 'go' }
      }
    } as Step
  ]

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'migrate-force-'))
  })
  afterEach(async () => {
    await rm(project, { recursive: true, force: true })
  })

  it('rewrites current recorded specs so an old test id still finds its element', async () => {
    const test = { id: 't2', name: 'Go', url: 'https://x.test', steps: testIdSteps }
    await saveRecordedTest(project, { ...layout, testIdAttribute: 'data-testid' }, test)
    const before = await readFile(join(project, 'spec', 'go_spec.rb'), 'utf-8')
    expect(before).toContain("test_id: 'go'")

    const next = { ...layout, testIdAttribute: 'data-qa' }
    expect(await migrateRecordedTests(project, next)).toBe(0)
    expect(await migrateRecordedTests(project, next, { force: true })).toBe(1)
    const after = await readFile(join(project, 'spec', 'go_spec.rb'), 'utf-8')
    expect(after).not.toContain("test_id: 'go'")
    expect(after).toContain('data-testid')
  })
})

