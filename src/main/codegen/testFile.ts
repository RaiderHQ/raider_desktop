import type { RecorderSettings } from '../../shared/types/recorderSettings'
import type { Step } from '../../shared/types/step'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { rubyString, STRING_LITERAL } from './ruby'
import { renderStep } from './steps'
import { describeStepEnglish } from '../../shared/describeStepEnglish'
import { withSecretNames } from '../../shared/secretSteps'
import { normalizeTags } from '../../shared/tags'
import type { StepLines } from '../../shared/types/projectTest'

/**
 * The shape of the Ruby this module writes. Stored in each sidecar, so a project
 * opened after the shape changed regenerates its recorded specs once (see
 * migrateRecordedTests). 2: the ruby_raider 4.0 runtime (by_role / label / text /
 * test_id locators, block-form matchers, no WaitHelper, no eventually).
 */
export const CODEGEN_VERSION = 2

type FileSettings = Pick<RecorderSettings, 'browser' | 'headless' | 'explicitWait'>

const BROWSERS = ['chrome', 'firefox', 'safari', 'edge']

const MAX_TITLE = 500

/** English description of a step for the sidecar map; capped so a long label can't bloat it. */
function stepTitle(step: Step): string {
  const text = describeStepEnglish(step)
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text
}

function browserSymbol(browser: string): string {
  const name = browser.toLowerCase()
  return BROWSERS.includes(name) ? name : 'chrome'
}

// The runtime's own waits replace the implicit wait, which the gem's README asks to leave unset
function seleniumSetup(settings: FileSettings, needsWait: boolean): string[] {
  const browser = browserSymbol(settings.browser)
  // Always a number, whatever the settings object carried
  const wait = Number(settings.explicitWait)
  const lines: string[] = [`Raider.timeout = ${wait}`]
  if (settings.headless && (browser === 'chrome' || browser === 'edge')) {
    const klass = browser === 'chrome' ? 'Chrome' : 'Edge'
    lines.push(
      `options = Selenium::WebDriver::${klass}::Options.new`,
      "options.add_argument('--headless=new')",
      `@driver = Selenium::WebDriver.for :${browser}, options: options`
    )
  } else {
    lines.push(`@driver = Selenium::WebDriver.for :${browser}`)
  }
  if (needsWait)
    lines.push(`@wait = Selenium::WebDriver::Wait.new(timeout: ${wait})`)
  return lines
}

const indent = (text: string, spaces: number): string =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : ' '.repeat(spaces) + line))
    .join('\n')

/** `, :a, :b` for the describe line (sorted symbols), or nothing without tags. */
const tagMetadata = (tags: string[] | undefined): string =>
  normalizeTags(tags)
    .map((tag) => `, :${tag}`)
    .join('')

// The runtime's matchers and by_role, included in the describe so the spec runs the same
// in a project whose spec_helper predates 4.0 (pin bumped, helpers not regenerated)
const RUNTIME_REQUIRE = "require 'ruby_raider/runtime/rspec'"
const RUNTIME_INCLUDES = ['  include Raider::Matchers', '  include Raider::Helpers']

// Ruby string literals and trailing comments, so recorded values like 'expect delays' don't count
const TRAILING_COMMENT = /#.*$/
const WAIT_WORD = /\bwait\b/

// Recorded steps never use a wait object; custom code may still mention one
const mentionsWait = (body: string[]): boolean =>
  body.some((line) => WAIT_WORD.test(line.replace(STRING_LITERAL, "''")))

/** Builds a standalone RSpec file (run and export share it) from structured steps. */
export function generateRspecFile(
  test: { name: string; steps: Step[]; tags?: string[] },
  settings: FileSettings
): string {
  const name = rubyString(test.name)
  // Steps loaded through migrateLegacyTest are named already; this covers any caller that isn't
  const body = withSecretNames(test.steps).map((step) => indent(renderStep(step), 4))
  const setup = seleniumSetup(settings, mentionsWait(body))

  return [
    "require 'selenium-webdriver'",
    "require 'rspec'",
    RUNTIME_REQUIRE,
    '',
    `describe ${name}${tagMetadata(test.tags)} do`,
    ...RUNTIME_INCLUDES,
    '',
    '  before(:each) do',
    ...setup.map((l) => `    ${l}`),
    '  end',
    '',
    '  after(:each) do',
    '    @driver.quit',
    '  end',
    '',
    `  it ${name} do`,
    ...body,
    '  end',
    'end',
    ''
  ].join('\n')
}

// Same lookup the project's own config uses: explicit_wait, falling back to timeout, then 10
const CONFIG_WAIT = "config.fetch('explicit_wait', config.fetch('timeout', 10))"

// rubocop-rspec's DescribeClass accepts a describe string only when it reads like a constant
const CONSTANT_LIKE = /^(?:(?:::)?[A-Z]\w*)+$/
const EXPECTATION = /\b(?:expect|is_expected|are_expected|expect_any_instance_of)\b/g

/**
 * The cops (at rubocop-rspec defaults) a recorded test would trip. The file is
 * regenerated, so they are disabled around it; disabling one that would not
 * fire is itself an offense (Lint/RedundantCopDisableDirective), so the list
 * must match the test.
 */
function copsToDisable(name: string, body: string[]): string[] {
  // ExampleLength counts code lines only, like rubocop with CountComments off
  const code = body
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  const expectations = code.reduce((n, line) => {
    const bare = line.replace(STRING_LITERAL, "''").replace(TRAILING_COMMENT, '')
    return n + (bare.match(EXPECTATION)?.length ?? 0)
  }, 0)
  const cops: string[] = []
  if (!CONSTANT_LIKE.test(name)) cops.push('RSpec/DescribeClass')
  if (code.length > 5) cops.push('RSpec/ExampleLength')
  if (expectations > 1) cops.push('RSpec/MultipleExpectations')
  // A recording with no check is still a test the user wants to run
  if (expectations === 0) cops.push('RSpec/NoExpectationExample')
  return cops
}

/** Header line that marks a spec file as written by Raider (hashRuby ignores comments). */
export const RECORDED_MARKER = '# Recorded with Raider.'

/** Hex sha256 of the text's exact utf-8 bytes (re-exported by the step-lines module). */
export const sha256Bytes = (content: string): string =>
  createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex')

type ProjectSpecOptions = { fileRelPath: string; helperPath: string }

/**
 * Builds a recorded spec that lives inside a Ruby Raider project and uses the
 * project's spec_helper (driver) instead of creating its own session.
 * `fileRelPath` and `helperPath` are relative to the project root.
 */
export function generateProjectSpecFile(
  test: { name: string; steps: Step[]; tags?: string[] },
  opts: ProjectSpecOptions
): string {
  return generateProjectSpecFileWithMap(test, opts).content
}

/** The project spec file plus the lines each step was written to. */
export function generateProjectSpecFileWithMap(
  test: { name: string; steps: Step[]; tags?: string[] },
  opts: ProjectSpecOptions
): { content: string; stepLines: StepLines } {
  const name = rubyString(test.name)
  const fileRel = opts.fileRelPath.replace(/\\/g, '/')
  const helperRel = opts.helperPath.replace(/\\/g, '/')
  if (
    posix.isAbsolute(fileRel) ||
    posix.isAbsolute(helperRel) ||
    /^[A-Za-z]:/.test(fileRel + helperRel)
  )
    throw new Error('Project spec paths must be relative to the project root')
  const toHelper = posix.relative(posix.dirname(fileRel), posix.join(helperRel, 'spec_helper'))
  const named = withSecretNames(test.steps)
  const body = named.map((step) => indent(renderStep(step, { receiver: 'helper' }), 4))
  const setup = mentionsWait(body)
    ? [
        '  let(:wait) do',
        "    config = YAML.load_file('config/config.yml')",
        `    Selenium::WebDriver::Wait.new(timeout: ${CONFIG_WAIT})`,
        '  end',
        ''
      ]
    : []
  const cops = copsToDisable(test.name, body).join(', ')

  const lines = [
    '# frozen_string_literal: true',
    '',
    `${RECORDED_MARKER} Edit in Raider; editing here makes the test code-owned.`,
    ...(cops ? [`# rubocop:disable ${cops}`] : []),
    `require_relative ${rubyString(toHelper)}`,
    RUNTIME_REQUIRE,
    '',
    `describe ${name}${tagMetadata(test.tags)} do`,
    ...RUNTIME_INCLUDES,
    '',
    ...setup,
    `  it ${name} do`
  ]
  const ranges = body.map((chunk, i) => {
    const start = lines.length + 1
    const chunkLines = chunk.split('\n')
    lines.push(...chunkLines)
    return {
      stepId: named[i].id,
      start,
      end: start + chunkLines.length - 1,
      title: stepTitle(named[i])
    }
  })
  lines.push('  end', 'end', ...(cops ? [`# rubocop:enable ${cops}`] : []), '')
  const content = lines.join('\n')
  return { content, stepLines: { fileSha256: sha256Bytes(content), ranges } }
}
