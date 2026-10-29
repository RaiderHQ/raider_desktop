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
// Recorded values that contain the word "expect" are not expectations
const expectWords: Step[] = [
  { id: 'n', kind: 'navigate', url: 'https://x.io/expect' },
  {
    id: 'a',
    kind: 'assert',
    check: 'textIncludes',
    element: { strategy: 'css', value: '#expect' },
    expected: "expect delays, don't expect(refunds)"
  }
]
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

  // rubocop flags a disable for a cop that would not fire, so the directive must match the test
  describe('rubocop directive', () => {
    const directive = (out: string): string | undefined =>
      out.match(/^# rubocop:disable (.*)$/m)?.[1]
    const nav: Step = { id: 'n', kind: 'navigate', url: 'https://x.io' }
    const assert: Step = { id: 'a', kind: 'assert', check: 'titleEquals', expected: 'T' }

    it('disables the length and expectation cops on a long test', () => {
      expect(directive(generateProjectSpecFile(test, 'selenium', opts))).toBe(
        'RSpec/ExampleLength, RSpec/MultipleExpectations'
      )
    })

    it('leaves no directive when no cop would fire', () => {
      const out = generateProjectSpecFile({ name: 'Login', steps: [nav, assert] }, 'selenium', opts)
      expect(out).not.toContain('rubocop:')
    })

    it('disables DescribeClass only for names that do not look like a class', () => {
      for (const name of ['Add to cart', 'login', 'Login-page', 'Login page']) {
        const out = generateProjectSpecFile({ name, steps: [nav, assert] }, 'selenium', opts)
        expect(directive(out), name).toBe('RSpec/DescribeClass')
      }
      for (const name of ['Login', 'LoginPage', 'Admin::Login', 'Login2']) {
        const out = generateProjectSpecFile({ name, steps: [nav] }, 'watir', opts)
        expect(out, name).not.toContain('rubocop:')
      }
    })

    it('counts expectations, including ones in custom code', () => {
      const custom: Step = { id: 'c', kind: 'custom', code: 'expect(driver.title).to eq("T")' }
      const out = generateProjectSpecFile(
        { name: 'Login', steps: [assert, custom] },
        'selenium',
        opts
      )
      expect(directive(out)).toBe('RSpec/MultipleExpectations')
    })

    it('ignores the word expect inside recorded values', () => {
      const out = generateProjectSpecFile({ name: 'Login', steps: expectWords }, 'selenium', opts)
      expect(out).not.toContain('rubocop:')
      const watir = generateProjectSpecFile({ name: 'Login', steps: expectWords }, 'watir', opts)
      expect(watir).not.toContain('rubocop:')
    })

    it('ignores the word expect in a comment after code', () => {
      const custom: Step = { id: 'c', kind: 'custom', code: 'x = 1 # expect it to be 1' }
      const out = generateProjectSpecFile(
        { name: 'Login', steps: [assert, custom] },
        'selenium',
        opts
      )
      expect(out).not.toContain('rubocop:')
    })

    it('counts example lines without blank or comment lines', () => {
      const code = Array.from({ length: 5 }, (_, i) => `x${i} = ${i}`).join('\n')
      const five: Step = { id: 'c', kind: 'custom', code: `${code}\n\n# note` }
      expect(
        generateProjectSpecFile({ name: 'Login', steps: [five] }, 'selenium', opts)
      ).not.toContain('rubocop:')
      expect(
        directive(generateProjectSpecFile({ name: 'Login', steps: [five, nav] }, 'selenium', opts))
      ).toBe('RSpec/ExampleLength')
    })

    it('re-enables exactly what it disabled', () => {
      const out = generateProjectSpecFile({ name: 'Add to cart', steps }, 'selenium', opts)
      const cops = directive(out)
      expect(cops).toBe('RSpec/DescribeClass, RSpec/ExampleLength, RSpec/MultipleExpectations')
      expect(out).toContain(`# rubocop:enable ${cops}`)
    })
  })

  it('numbers secret steps from 1 per test', () => {
    const secret = (id: string): Step => ({ id, kind: 'type', element: el, text: '', secret: true })
    const out = generateProjectSpecFile(
      { name: 'Login', steps: [secret('a'), steps[2], secret('b')] },
      'watir',
      opts
    )
    expect(out).toContain("set(ENV.fetch('RAIDER_SECRET_1'))")
    expect(out).toContain("set(ENV.fetch('RAIDER_SECRET_2'))")
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
  it.skipIf(!rubocopProject)(
    'rubocop accepts project spec',
    () => {
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
        ...Array.from(
          { length: 12 },
          (_, i): Step => ({ id: `c${i}`, kind: 'click', element: el })
        ),
        { id: 'a1', kind: 'assert', check: 'displayed', element: el },
        { id: 'a2', kind: 'assert', check: 'textEquals', element: el, expected: 'Hi' },
        { id: 'a3', kind: 'assert', check: 'urlIncludes', expected: '/home' }
      ]
      const short: Step[] = [
        { id: 'n', kind: 'navigate', url: 'https://x.io' },
        { id: 'a', kind: 'assert', check: 'displayed', element: el }
      ]
      const cases = [
        { name: 'Many', steps: many },
        { name: 'Add to cart', steps: many },
        { name: 'Add to cart', steps: short },
        { name: 'Login', steps: short },
        { name: 'Login', steps: expectWords }
      ]
      for (const [i, c] of cases.entries())
        for (const automation of ['selenium', 'watir'] as const) {
          const rel = `spec/zz_recorded_${automation}_${i}_spec.rb`
          const file = join(rubocopProject!, rel)
          writeFileSync(
            file,
            generateProjectSpecFile(c, automation, {
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
            expect(
              r.stdout + r.stderr,
              `${c.name} (${c.steps.length} steps, ${automation})`
            ).toContain('no offenses detected')
          } finally {
            rmSync(file, { force: true })
          }
        }
    },
    // one real rubocop run per case and automation
    60_000
  )
})
