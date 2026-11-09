import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeLog', () => ({
  safeError: vi.fn(),
  safeLog: vi.fn(),
  safeWarn: vi.fn()
}))
vi.mock('../../../src/main/handlers/tests/recordedTests', async (importOriginal) => {
  const orig =
    await importOriginal<typeof import('../../../src/main/handlers/tests/recordedTests')>()
  return { ...orig, findSidecarById: vi.fn(), stepLinesFor: vi.fn() }
})

import { FlowHasChecksError, generateFlowFileWithMap } from '../../../src/main/codegen/flowFile'
import { renderStep } from '../../../src/main/codegen/steps'
import { rubyString } from '../../../src/main/codegen/ruby'
import { generateProjectSpecFileWithMap } from '../../../src/main/codegen/testFile'
import { FLOW_NAME, RESERVED_FLOW_NAMES, flowFile, flowStem } from '../../../src/shared/flows'
import { appState } from '../../../src/main/handlers/appState'
import { mapFailedStepHandler } from '../../../src/main/handlers/tests/mapFailedStep'
import { findSidecarById, stepLinesFor } from '../../../src/main/handlers/tests/recordedTests'
import type { Sidecar } from '../../../src/shared/types/projectTest'
import type { Step } from '../../../src/shared/types/step'

const hours = {
  strategy: 'css' as const,
  value: '#hours',
  locator: { by: 'label' as const, text: 'Hours' }
}
const save = {
  strategy: 'css' as const,
  value: '#save',
  locator: { by: 'role' as const, role: 'button', name: 'Save' }
}
const timesheet: Step[] = [
  { id: 'n', kind: 'navigate', url: 'http://127.0.0.1:8765/index.html' },
  { id: 't', kind: 'type', element: hours, text: '8', inputName: 'hours' },
  { id: 'c', kind: 'click', element: save }
]
const flow = { name: 'Fill timesheet', steps: timesheet }

describe('generateFlowFileWithMap', () => {
  it('writes the shape the gem runs', () => {
    expect(generateFlowFileWithMap(flow, {}).content).toBe(
      [
        '# frozen_string_literal: true',
        '',
        '# Recorded with Raider. Edit in Raider; editing here makes the flow code-owned.',
        '# rubocop:disable RSpec/DescribeClass, RSpec/NoExpectationExample',
        "require_relative 'flow_helper'",
        "require 'ruby_raider/runtime/rspec'",
        '',
        "RSpec.describe 'Fill timesheet', flow: true do",
        '  include Raider::Matchers',
        '  include Raider::Helpers',
        '',
        "  it 'runs' do",
        "    driver.navigate.to('http://127.0.0.1:8765/index.html')",
        "    driver.find_element(label: ['Hours', { exact: true }]).clear",
        "    driver.find_element(label: ['Hours', { exact: true }]).send_keys(flow_input('hours', '8'))",
        "    driver.find_element(by_role('button', name: 'Save', exact: true)).click",
        '  end',
        'end',
        '# rubocop:enable RSpec/DescribeClass, RSpec/NoExpectationExample',
        ''
      ].join('\n')
    )
  })

  it('maps each step to its lines with a title, hashed over the content', () => {
    const { content, stepLines } = generateFlowFileWithMap(flow, {})
    const lines = content.split('\n')
    expect(stepLines.ranges.map(({ stepId, start, end }) => [stepId, start, end])).toEqual([
      ['n', 13, 13],
      ['t', 14, 15],
      ['c', 16, 16]
    ])
    expect(lines[13]).toContain('.clear')
    expect(lines[14]).toContain('flow_input')
    expect(stepLines.ranges.every((r) => typeof r.title === 'string' && r.title !== '')).toBe(true)
    expect(stepLines.fileSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a flow with checks, naming every assert step', () => {
    const steps: Step[] = [
      ...timesheet,
      { id: 'a1', kind: 'assert', check: 'titleEquals', expected: 'Saved' },
      { id: 'a2', kind: 'assert', check: 'displayed', element: save }
    ]
    let error: unknown
    try {
      generateFlowFileWithMap({ name: 'X', steps }, {})
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(FlowHasChecksError)
    expect((error as FlowHasChecksError).stepIds).toEqual(['a1', 'a2'])
  })

  it('refuses checks before rendering, so a malformed assert still reports its id', () => {
    const bad = { id: 'a', kind: 'assert', check: 'textEquals', element: save } as Step
    expect(() => generateFlowFileWithMap({ name: 'X', steps: [bad] }, {})).toThrow(
      FlowHasChecksError
    )
  })

  it('keeps custom code steps', () => {
    const steps: Step[] = [{ id: 'x', kind: 'custom', code: "puts 'hi'" }]
    expect(generateFlowFileWithMap({ name: 'X', steps }, {}).content).toContain("    puts 'hi'")
  })

  it('adds the project wait object when custom code uses one, like a spec', () => {
    const steps: Step[] = [{ id: 'w', kind: 'custom', code: 'wait.until { true }' }]
    expect(generateFlowFileWithMap({ name: 'Waits', steps }, {}).content).toMatchInlineSnapshot(`
      "# frozen_string_literal: true

      # Recorded with Raider. Edit in Raider; editing here makes the flow code-owned.
      # rubocop:disable RSpec/NoExpectationExample
      require_relative 'flow_helper'
      require 'ruby_raider/runtime/rspec'

      RSpec.describe 'Waits', flow: true do
        include Raider::Matchers
        include Raider::Helpers

        let(:wait) do
          config = YAML.load_file('config/config.yml')
          Selenium::WebDriver::Wait.new(timeout: config.fetch('explicit_wait', config.fetch('timeout', 10)))
        end

        it 'runs' do
          wait.until { true }
        end
      end
      # rubocop:enable RSpec/NoExpectationExample
      "
    `)
  })

  it('escapes the flow name and the input default like typed text', () => {
    const steps: Step[] = [
      { id: 't', kind: 'type', element: hours, text: "it's a \\ #{x}", inputName: 'note' }
    ]
    const { content } = generateFlowFileWithMap({ name: "Bob's #{flow}", steps }, {})
    expect(content).toContain("RSpec.describe 'Bob\\'s #{flow}', flow: true do")
    expect(content).toContain(".send_keys(flow_input('note', 'it\\'s a \\\\ #{x}'))")
    expect(content).toContain(
      `flow_input('note', ${rubyString(steps[0].kind === 'type' ? steps[0].text : '')})`
    )
  })

  it('never turns a secret step into an input', () => {
    const secret = {
      id: 'p',
      kind: 'type',
      element: hours,
      text: '',
      secret: true,
      secretName: 'RAIDER_SECRET_1',
      inputName: 'password'
    } as Step
    const { content } = generateFlowFileWithMap({ name: 'X', steps: [secret] }, {})
    expect(content).not.toContain('flow_input')
    expect(content).toContain(".send_keys(ENV.fetch('RAIDER_SECRET_1'))")
  })

  it('honors the project test id attribute', () => {
    const el = {
      strategy: 'css' as const,
      value: '[data-qa="go"]',
      locator: { by: 'testId' as const, attribute: 'data-qa', value: 'go' }
    }
    const steps: Step[] = [{ id: 'c', kind: 'click', element: el }]
    expect(
      generateFlowFileWithMap({ name: 'X', steps }, { testIdAttribute: 'data-qa' }).content
    ).toContain("driver.find_element(test_id: 'go').click")
  })

  it('a test spec ignores input names', () => {
    const { content } = generateProjectSpecFileWithMap(
      { name: 'T', steps: timesheet },
      { fileRelPath: 'spec/t_spec.rb', helperPath: 'helpers' }
    )
    expect(content).not.toContain('flow_input')
    expect(content).toContain(".send_keys('8')")
  })
})

describe('renderStep flow option', () => {
  const step: Step = { id: 't', kind: 'type', element: hours, text: '8', inputName: 'hours' }

  it('renders flow_input only with the option', () => {
    expect(renderStep(step, { receiver: 'helper', flow: true })).toContain(
      "send_keys(flow_input('hours', '8'))"
    )
    expect(renderStep(step, { receiver: 'helper' })).toContain("send_keys('8')")
  })

  it('types the text when a flow step has no input name', () => {
    const plain: Step = { id: 't', kind: 'type', element: hours, text: '8' }
    expect(renderStep(plain, { flow: true })).toContain("send_keys('8')")
  })

  it('refuses an input name that fails the rule', () => {
    expect(() => renderStep({ ...step, inputName: "x'); system('id" }, { flow: true })).toThrow()
  })
})

describe('flowStem', () => {
  const valid = (stem: string): void => {
    expect(stem).toMatch(FLOW_NAME)
    expect(RESERVED_FLOW_NAMES).not.toContain(stem)
  }

  it('numbers from the second file on', () => {
    expect(flowStem('fill_timesheet', 1)).toBe('fill_timesheet')
    expect(flowStem('fill_timesheet', 2)).toBe('fill_timesheet_2')
  })

  it('cuts a long slug so the number still fits in 60', () => {
    const slug = 'a'.repeat(60)
    for (const n of [1, 2, 10, 1000]) {
      const stem = flowStem(slug, n)
      valid(stem)
      expect(stem.endsWith(n === 1 ? 'a' : `_${n}`)).toBe(true)
    }
    expect(flowStem(slug, 1000)).toHaveLength(60)
  })

  it('never leaves a double underscore where the cut lands', () => {
    const slug = `${'a'.repeat(57)}_bc`
    expect(flowStem(slug, 2)).toBe(`${'a'.repeat(57)}_2`)
    valid(flowStem(slug, 2))
  })

  it('never names a flow env, and falls back for an empty or unusable slug', () => {
    for (const slug of ['env', '', '___', 'Bad Slug', '../x']) {
      for (const n of [1, 2]) valid(flowStem(slug, n))
    }
    expect(flowStem('env', 1)).not.toBe('env')
  })

  it('puts the file in flows/ at the project root', () => {
    expect(flowFile('fill_timesheet')).toBe('flows/fill_timesheet_flow.rb')
  })
})

describe('mapFailedStep on a flow', () => {
  let project: string
  const steps: Step[] = [...timesheet, { id: 'x', kind: 'custom', code: "puts 'one'\nputs 'two'" }]
  const { stepLines } = generateFlowFileWithMap({ name: 'Fill timesheet', steps }, {})
  const sidecar: Sidecar = {
    version: 1,
    id: 'f1',
    kind: 'flow',
    name: 'Fill timesheet',
    url: 'http://127.0.0.1:8765/index.html',
    steps,
    file: 'flows/fill_timesheet_flow.rb',
    hash: 'h',
    stepLines,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z'
  }
  const failure = (line: number): unknown => ({
    file: './flows/fill_timesheet_flow.rb',
    backtrace: [`./flows/fill_timesheet_flow.rb:${line}:in 'block (2 levels)'`],
    finishedAt: '2026-11-02T00:00:00.000Z'
  })
  const range = (id: string): { start: number; end: number } =>
    stepLines.ranges.find((r) => r.stepId === id)!

  beforeEach(async () => {
    project = await realpath(await mkdtemp(join(tmpdir(), 'raider-flowmap-')))
    appState.projectPath = project
    appState.layout = {
      framework: 'rspec',
      automation: 'selenium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      recordable: true
    }
    vi.mocked(findSidecarById).mockResolvedValue(sidecar)
    vi.mocked(stepLinesFor).mockResolvedValue({ sidecar, stepLines })
  })

  afterEach(async () => {
    appState.projectPath = ''
    appState.layout = null
    await rm(project, { recursive: true, force: true })
  })

  it('maps a line inside a multi-line step to that step', async () => {
    expect(await mapFailedStepHandler(project, 'f1', failure(range('t').end))).toEqual({
      stepId: 't',
      index: 1
    })
    expect(await mapFailedStepHandler(project, 'f1', failure(range('x').end))).toEqual({
      stepId: 'x',
      index: 3
    })
  })

  it("reports the it 'runs' line as outside the steps", async () => {
    expect(await mapFailedStepHandler(project, 'f1', failure(range('n').start - 1))).toEqual({
      none: 'outsideSteps'
    })
  })
})
