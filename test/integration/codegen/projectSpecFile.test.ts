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
const custom = (code: string): Step => ({ id: 'c', kind: 'custom', code })

describe('generateProjectSpecFile', () => {
  it('uses the spec_helper driver and the runtime, with no wait object', () => {
    const out = generateProjectSpecFile(test, opts)
    expect(out).toContain('# Recorded with Raider.')
    expect(out).toContain("require_relative '../helpers/spec_helper'")
    expect(out).toContain("require 'ruby_raider/runtime/rspec'")
    expect(out).toContain('driver.navigate.to(')
    expect(out).toContain("driver.find_element(css: '#a').click")
    expect(out).toContain("expect { driver.find_element(css: '#a') }.to be_visible")
    expect(out).toContain("expect(driver).to have_title('T')")
    expect(out).not.toContain('@driver')
    expect(out).not.toContain('wait')
    expect(out).not.toContain('YAML.load_file')
    expect(out).not.toContain('eventually')
  })

  // A project whose spec_helper predates 4.0 (pin bumped, helpers kept) has no
  // Raider::Matchers of its own, so the spec brings them along
  it('includes the runtime matchers and by_role inside the describe', () => {
    const out = generateProjectSpecFile(test, opts)
    expect(out).toMatch(
      /describe 'Checkout' do\n {2}include Raider::Matchers\n {2}include Raider::Helpers\n\n {2}it 'Checkout' do\n/
    )
  })

  it('keeps let(:wait) only when custom code uses wait', () => {
    const out = generateProjectSpecFile(
      { name: 'Login', steps: [steps[0], custom('wait.until { true }')] },
      opts
    )
    expect(out).toContain('let(:wait) do')
    expect(out).toContain("fetch('explicit_wait'")
    const quoted = generateProjectSpecFile(
      { name: 'Login', steps: [steps[0], custom("puts 'wait here'")] },
      opts
    )
    expect(quoted).not.toContain('let(:wait)')
  })

  it('require path from nested file', () => {
    const out = generateProjectSpecFile(test, {
      fileRelPath: 'spec/recorded/a_spec.rb',
      helperPath: 'helpers'
    })
    expect(out).toContain("require_relative '../../helpers/spec_helper'")
  })

  it('quotes the require path and rejects absolute paths', () => {
    const out = generateProjectSpecFile(test, {
      fileRelPath: 'spec/a_spec.rb',
      helperPath: "he'lpers"
    })
    expect(out).toContain("require_relative '../he\\'lpers/spec_helper'")
    expect(() =>
      generateProjectSpecFile(test, { fileRelPath: 'spec/a_spec.rb', helperPath: '/abs' })
    ).toThrow(/relative/)
    expect(() =>
      generateProjectSpecFile(test, { fileRelPath: '/abs/a_spec.rb', helperPath: 'helpers' })
    ).toThrow(/relative/)
  })

  // rubocop flags a disable for a cop that would not fire, so the directive must match the test
  describe('rubocop directive', () => {
    const directive = (out: string): string | undefined =>
      out.match(/^# rubocop:disable (.*)$/m)?.[1]
    const nav: Step = { id: 'n', kind: 'navigate', url: 'https://x.io' }
    const assert: Step = { id: 'a', kind: 'assert', check: 'titleEquals', expected: 'T' }

    it('disables the length and expectation cops on a long test', () => {
      expect(directive(generateProjectSpecFile(test, opts))).toBe(
        'RSpec/ExampleLength, RSpec/MultipleExpectations'
      )
    })

    it('leaves no directive when no cop would fire', () => {
      const out = generateProjectSpecFile({ name: 'Login', steps: [nav, assert] }, opts)
      expect(out).not.toContain('rubocop:')
    })

    it('disables DescribeClass only for names that do not look like a class', () => {
      for (const name of ['Add to cart', 'login', 'Login-page', 'Login page']) {
        const out = generateProjectSpecFile({ name, steps: [nav, assert] }, opts)
        expect(directive(out), name).toBe('RSpec/DescribeClass')
      }
      for (const name of ['Login', 'LoginPage', 'Admin::Login', 'Login2']) {
        const out = generateProjectSpecFile({ name, steps: [nav, assert] }, opts)
        expect(out, name).not.toContain('rubocop:')
      }
    })

    it('disables NoExpectationExample for a recording without a check', () => {
      expect(directive(generateProjectSpecFile({ name: 'Login', steps: [nav] }, opts))).toBe(
        'RSpec/NoExpectationExample'
      )
    })

    it('counts expectations, including ones in custom code', () => {
      const out = generateProjectSpecFile(
        { name: 'Login', steps: [assert, custom('expect(driver.title).to eq("T")')] },
        opts
      )
      expect(directive(out)).toBe('RSpec/MultipleExpectations')
    })

    it('counts a block-form matcher as one expectation', () => {
      const wait: Step = { id: 'w', kind: 'wait', element: el, until: 'visible' }
      expect(generateProjectSpecFile({ name: 'Login', steps: [nav, wait] }, opts)).not.toContain(
        'rubocop:'
      )
      expect(
        directive(generateProjectSpecFile({ name: 'Login', steps: [wait, assert] }, opts))
      ).toBe('RSpec/MultipleExpectations')
    })

    it('ignores the word expect inside recorded values', () => {
      const out = generateProjectSpecFile({ name: 'Login', steps: expectWords }, opts)
      expect(out).not.toContain('rubocop:')
    })

    it('ignores the word expect in a comment after code', () => {
      const out = generateProjectSpecFile(
        { name: 'Login', steps: [assert, custom('x = 1 # expect it to be 1')] },
        opts
      )
      expect(out).not.toContain('rubocop:')
    })

    it('counts example lines without blank or comment lines', () => {
      const code = Array.from({ length: 4 }, (_, i) => `x${i} = ${i}`).join('\n')
      const five: Step = { id: 'c', kind: 'custom', code: `${code}\n\n# note` }
      expect(
        directive(generateProjectSpecFile({ name: 'Login', steps: [five, assert] }, opts))
      ).toBe(undefined)
      expect(
        directive(generateProjectSpecFile({ name: 'Login', steps: [five, nav, assert] }, opts))
      ).toBe('RSpec/ExampleLength')
    })

    it('re-enables exactly what it disabled', () => {
      const out = generateProjectSpecFile({ name: 'Add to cart', steps }, opts)
      const cops = directive(out)
      expect(cops).toBe('RSpec/DescribeClass, RSpec/ExampleLength, RSpec/MultipleExpectations')
      expect(out).toContain(`# rubocop:enable ${cops}`)
    })
  })

  it('numbers secret steps from 1 per test', () => {
    const secret = (id: string): Step => ({ id, kind: 'type', element: el, text: '', secret: true })
    const out = generateProjectSpecFile(
      { name: 'Login', steps: [secret('a'), steps[2], secret('b')] },
      opts
    )
    expect(out).toContain("send_keys(ENV.fetch('RAIDER_SECRET_1'))")
    expect(out).toContain("send_keys(ENV.fetch('RAIDER_SECRET_2'))")
  })

  it('no step header', () => {
    expect(generateProjectSpecFile(test, opts)).not.toContain('raider-steps')
  })

  const ruby = findRuby()
  it.skipIf(!ruby)('ruby -c accepts output, with and without a wait object', () => {
    for (const s of [test.steps, [steps[0], custom('wait.until { true }')]]) {
      const file = join(mkdtempSync(join(tmpdir(), 'proj-')), 'x_spec.rb')
      writeFileSync(file, generateProjectSpecFile({ name: 'Checkout', steps: s }, opts))
      const r = spawnSync(ruby!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})

// Opt-in: point RAIDER_RUBOCOP_PROJECT at a COPY of a generated Ruby Raider 4.0 project
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
      const role = {
        strategy: 'xpath' as const,
        value: '//button',
        locator: { by: 'role' as const, role: 'button', name: 'Login' }
      }
      const many: Step[] = [
        { id: 'n', kind: 'navigate', url: 'https://x.io' },
        ...Array.from(
          { length: 12 },
          (_, i): Step => ({ id: `c${i}`, kind: 'click', element: el })
        ),
        { id: 'r', kind: 'click', element: role },
        { id: 'a1', kind: 'assert', check: 'displayed', element: el },
        { id: 'a2', kind: 'assert', check: 'textEquals', element: el, expected: 'Hi' },
        { id: 'a3', kind: 'assert', check: 'urlIncludes', expected: '/home' },
        { id: 'a4', kind: 'wait', element: role, until: 'hidden' }
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
        { name: 'Login', steps: expectWords },
        { name: 'Wait', steps: [short[0], custom('wait.until { true }')] },
        { name: 'Clicks only', steps: [short[0], { id: 'k', kind: 'click', element: role }] }
      ]
      for (const [i, c] of cases.entries()) {
        const rel = `spec/zz_recorded_${i}_spec.rb`
        const file = join(rubocopProject!, rel)
        writeFileSync(file, generateProjectSpecFile(c, { fileRelPath: rel, helperPath: 'helpers' }))
        try {
          const r = spawnSync('rbenv', ['exec', 'rubocop', rel], {
            cwd: rubocopProject,
            env,
            encoding: 'utf8'
          })
          expect(r.stdout + r.stderr, `${c.name} (${c.steps.length} steps)`).toContain(
            'no offenses detected'
          )
        } finally {
          rmSync(file, { force: true })
        }
      }
    },
    // one real rubocop run per case
    60_000
  )
})

describe('generateProjectSpecFile tags', () => {
  it('writes sorted symbols after the description', () => {
    const out = generateProjectSpecFile({ ...test, tags: ['smoke', 'api'] }, opts)
    expect(out).toContain("describe 'Checkout', :api, :smoke do")
  })

  it('is unchanged without tags', () => {
    const plain = generateProjectSpecFile(test, opts)
    expect(generateProjectSpecFile({ ...test, tags: [] }, opts)).toBe(plain)
    expect(plain).toContain("describe 'Checkout' do")
  })

  it('ignores tags that are not valid', () => {
    const out = generateProjectSpecFile({ ...test, tags: ['ok', 'no way', "x'y"] }, opts)
    expect(out).toContain("describe 'Checkout', :ok do")
  })
})
