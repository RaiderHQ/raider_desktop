import { describe, it, expect } from 'vitest'
import { generateProjectSpecFileWithMap } from '../../../src/main/codegen/testFile'
import { deriveStepLines } from '../../../src/main/handlers/tests/stepLines'
import { describeStepEnglish } from '../../../src/shared/describeStepEnglish'
import type { Sidecar } from '../../../src/shared/types/projectTest'
import type { Step } from '../../../src/shared/types/step'

const el = { strategy: 'css' as const, value: '#a' }
const steps: Step[] = [
  { id: 'nav', kind: 'navigate', url: 'https://shop.test/login' },
  { id: 'type', kind: 'type', element: el, text: 'ana@shop.test' },
  {
    id: 'secret',
    kind: 'type',
    element: el,
    text: '',
    secret: true,
    secretName: 'RAIDER_SECRET_1'
  },
  { id: 'click', kind: 'click', element: el },
  { id: 'assert', kind: 'assert', check: 'textIncludes', element: el, expected: 'Hi' },
  { id: 'custom', kind: 'custom', code: "puts 'TOPSECRETCODE'" }
]
const opts = { fileRelPath: 'spec/a_spec.rb', helperPath: 'helpers' }
const gen = (s: Step[] = steps) =>
  generateProjectSpecFileWithMap({ name: 'A', steps: s }, 'selenium', opts)

describe('step range titles', () => {
  it('save writes the English description for every range', () => {
    const { stepLines } = gen()
    expect(stepLines.ranges.map((r) => r.title)).toEqual(steps.map((s) => describeStepEnglish(s)))
    expect(stepLines.ranges[0].title).toBe('Visit https://shop.test/login')
  })

  it('a secret step names only the variable', () => {
    const t = gen().stepLines.ranges[2].title ?? ''
    expect(t).toContain('RAIDER_SECRET_1')
  })

  it('a custom step title is the custom string, not the code', () => {
    const t = gen().stepLines.ranges[5].title
    expect(t).toBe('Custom code step')
    expect(t).not.toContain('TOPSECRETCODE')
  })

  it('truncates a long title to 500 characters with an ellipsis', () => {
    const long: Step[] = [{ id: 'n', kind: 'navigate', url: 'https://x.test/' + 'a'.repeat(600) }]
    const t = gen(long).stepLines.ranges[0].title ?? ''
    expect(t.length).toBe(500)
    expect(t.endsWith('…')).toBe(true)
  })

  it('derivation for an older sidecar writes titles', () => {
    const { content } = gen()
    const sidecar = {
      version: 1,
      id: 't',
      name: 'A',
      url: 'u',
      steps,
      file: 'spec/a_spec.rb',
      automation: 'selenium',
      hash: 'h',
      createdAt: 'x',
      updatedAt: 'x'
    } as Sidecar
    const derived = deriveStepLines(sidecar, content, 'helpers')
    expect(derived?.ranges.every((r) => typeof r.title === 'string' && r.title.length > 0)).toBe(
      true
    )
  })
})
