import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateProjectSpecFile } from '../../../src/main/codegen/testFile'
import type { Step } from '../../../src/shared/types/step'
import { findRuby } from './rubyBin'

const el = { strategy: 'css' as const, value: '#a' }
const steps: Step[] = [
  { id: '1', kind: 'navigate', url: 'https://x.io' },
  { id: '2', kind: 'type', element: el, text: 'hi' },
  { id: '3', kind: 'click', element: el },
  { id: '4', kind: 'assert', check: 'displayed', element: el },
  { id: '5', kind: 'assert', check: 'titleEquals', expected: 'T' }
]
const test = { name: 'Checkout', steps }
const opts = { fileRelPath: 'spec/checkout_spec.rb', helperPath: 'helpers' }

describe('generateProjectSpecFile', () => {
  it('selenium uses driver and config wait', () => {
    const out = generateProjectSpecFile(test, 'selenium', opts)
    expect(out).toContain('driver.navigate.to(')
    expect(out).toContain('wait.until {')
    expect(out).toContain("fetch('explicit_wait'")
    expect(out).not.toContain('@driver')
    expect(out).not.toContain('@wait')
    expect(out).toContain("require_relative '../helpers/spec_helper'")
  })

  it('watir uses browser', () => {
    const out = generateProjectSpecFile(test, 'watir', opts)
    expect(out).toContain('browser.goto(')
    expect(out).toContain('Watir.default_timeout =')
    expect(out).not.toContain('@browser')
    // browser first, so the helper's own create_browser cannot reset the timeout afterwards
    expect(out).toMatch(/\n {4}browser\n[\s\S]*Watir\.default_timeout =/)
    expect(out).not.toContain('let(:wait)')
  })

  it('require path from nested file', () => {
    const out = generateProjectSpecFile(test, 'selenium', {
      fileRelPath: 'spec/recorded/a_spec.rb',
      helperPath: 'helpers'
    })
    expect(out).toContain("require_relative '../../helpers/spec_helper'")
  })

  it('quotes the require path and rejects absolute paths', () => {
    const out = generateProjectSpecFile(test, 'selenium', {
      fileRelPath: 'spec/a_spec.rb',
      helperPath: "he'lpers"
    })
    expect(out).toContain("require_relative '../he\\'lpers/spec_helper'")
    expect(() =>
      generateProjectSpecFile(test, 'selenium', {
        fileRelPath: 'spec/a_spec.rb',
        helperPath: '/abs'
      })
    ).toThrow(/relative/)
    expect(() =>
      generateProjectSpecFile(test, 'selenium', {
        fileRelPath: '/abs/a_spec.rb',
        helperPath: 'helpers'
      })
    ).toThrow(/relative/)
  })

  it('no step header', () => {
    expect(generateProjectSpecFile(test, 'selenium', opts)).not.toContain('raider-steps')
  })

  const ruby = findRuby()
  it.skipIf(!ruby)('ruby -c accepts output', () => {
    for (const automation of ['selenium', 'watir'] as const) {
      const file = join(mkdtempSync(join(tmpdir(), 'proj-')), 'x_spec.rb')
      writeFileSync(file, generateProjectSpecFile(test, automation, opts))
      const r = spawnSync(ruby!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})

// Opt-in: point RAIDER_RUBOCOP_PROJECT at a COPY of a generated Ruby Raider project
const rubocopProject = process.env.RAIDER_RUBOCOP_PROJECT
describe('rubocop', () => {
  it.skipIf(!rubocopProject)('rubocop accepts project spec', () => {
    const env = { ...process.env }
    for (const k of [
      'GEM_HOME',
      'GEM_PATH',
      'GEM_ROOT',
      'RUBY_ROOT',
      'RUBY_ENGINE',
      'RUBY_VERSION'
    ])
      delete env[k]
    const many: Step[] = [
      { id: 'n', kind: 'navigate', url: 'https://x.io' },
      ...Array.from({ length: 12 }, (_, i): Step => ({ id: `c${i}`, kind: 'click', element: el })),
      { id: 'a1', kind: 'assert', check: 'displayed', element: el },
      { id: 'a2', kind: 'assert', check: 'textEquals', element: el, expected: 'Hi' },
      { id: 'a3', kind: 'assert', check: 'urlIncludes', expected: '/home' }
    ]
    for (const automation of ['selenium', 'watir'] as const) {
      const rel = `spec/zz_recorded_${automation}_spec.rb`
      const file = join(rubocopProject!, rel)
      writeFileSync(
        file,
        generateProjectSpecFile({ name: 'Many', steps: many }, automation, {
          fileRelPath: rel,
          helperPath: 'helpers'
        })
      )
      try {
        const r = spawnSync('rbenv', ['exec', 'rubocop', rel], {
          cwd: rubocopProject,
          env,
          encoding: 'utf8'
        })
        expect(r.stdout + r.stderr).toContain('no offenses detected')
      } finally {
        rmSync(file, { force: true })
      }
    }
  })
})
