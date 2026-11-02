import { describe, it, expect } from 'vitest'
import {
  generateProjectSpecFile,
  generateProjectSpecFileWithMap
} from '../../../src/main/codegen/testFile'
import { renderStep } from '../../../src/main/codegen/steps'
import { sha256Bytes } from '../../../src/main/handlers/tests/stepLines'
import type { Automation } from '../../../src/main/codegen/testFile'
import type { Step } from '../../../src/shared/types/step'

const el = { strategy: 'css' as const, value: '#a' }
const allKinds: Step[] = [
  { id: 'nav', kind: 'navigate', url: 'https://x.io' },
  { id: 'click', kind: 'click', element: el },
  { id: 'type', kind: 'type', element: el, text: 'hi' },
  {
    id: 'secret',
    kind: 'type',
    element: { strategy: 'id', value: 'pw' },
    text: '',
    secret: true,
    secretName: 'RAIDER_SECRET_1'
  },
  { id: 'key', kind: 'pressKey', element: el, key: 'Enter' },
  { id: 'wait', kind: 'wait', element: el, until: 'visible' },
  { id: 'assertEl', kind: 'assert', check: 'textIncludes', element: el, expected: 'Hi' },
  { id: 'title', kind: 'assert', check: 'titleEquals', expected: 'T' },
  { id: 'frame', kind: 'switchFrame', element: { strategy: 'id', value: 'f' } },
  { id: 'frameOut', kind: 'switchFrame' },
  { id: 'custom', kind: 'custom', code: "puts 'a'\nputs 'b'\nputs 'c'" }
]
const opts = { fileRelPath: 'spec/checkout_spec.rb', helperPath: 'helpers' }

const indent4 = (text: string): string =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : `    ${line}`))
    .join('\n')

const cases: {
  title: string
  name: string
  steps: Step[]
  automation: Automation
  waitHelper: boolean
  check?: (content: string) => void
}[] = [
  {
    title: 'selenium',
    name: 'Checkout',
    steps: allKinds,
    automation: 'selenium',
    waitHelper: false
  },
  {
    title: 'selenium with the wait helper',
    name: 'Checkout',
    steps: allKinds,
    automation: 'selenium',
    waitHelper: true
  },
  { title: 'watir', name: 'Checkout', steps: allKinds, automation: 'watir', waitHelper: false },
  {
    title: 'a name that disables cops',
    name: 'checkout flow',
    steps: allKinds,
    automation: 'selenium',
    waitHelper: false,
    check: (content) => expect(content).toContain('# rubocop:disable')
  },
  {
    title: 'custom code that keeps let(:wait) with the wait helper',
    name: 'Checkout',
    steps: [
      { id: 'nav', kind: 'navigate', url: 'https://x.io' },
      { id: 'custom', kind: 'custom', code: 'wait.until { true }\nputs 1' },
      { id: 'click', kind: 'click', element: el }
    ],
    automation: 'selenium',
    waitHelper: true,
    check: (content) => expect(content).toContain('let(:wait)')
  }
]

describe('generateProjectSpecFileWithMap', () => {
  for (const c of cases) {
    it(`maps every step to its lines: ${c.title}`, () => {
      const test = { name: c.name, steps: c.steps }
      const options = { ...opts, waitHelper: c.waitHelper }
      const { content, stepLines } = generateProjectSpecFileWithMap(test, c.automation, options)

      expect(content).toBe(generateProjectSpecFile(test, c.automation, options))
      c.check?.(content)
      expect(stepLines.fileSha256).toBe(sha256Bytes(content))
      expect(stepLines.ranges.map((r) => r.stepId)).toEqual(c.steps.map((s) => s.id))

      const lines = content.split('\n')
      const waitHelper = c.automation === 'selenium' && c.waitHelper
      let previousEnd = 0
      c.steps.forEach((step, i) => {
        const range = stepLines.ranges[i]
        const render = indent4(renderStep(step, c.automation, { receiver: 'helper', waitHelper }))
        const renderLines = render.split('\n')
        expect(range.start).toBeGreaterThan(previousEnd)
        expect(lines[range.start - 1]).toBe(renderLines[0])
        expect(range.end - range.start + 1).toBe(renderLines.length)
        expect(lines.slice(range.start - 1, range.end).join('\n')).toBe(render)
        previousEnd = range.end
      })
    })
  }
})
