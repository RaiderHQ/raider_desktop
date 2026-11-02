import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { generateProjectSpecFileWithMap } from '../../../src/main/codegen/testFile'
import {
  deriveStepLines,
  sha256Bytes,
  usableStepLines
} from '../../../src/main/handlers/tests/stepLines'
import type { Sidecar } from '../../../src/shared/types/projectTest'
import type { Step } from '../../../src/shared/types/step'

const steps: Step[] = [
  { id: 'n', kind: 'navigate', url: 'https://x.test' },
  { id: 'c', kind: 'click', element: { strategy: 'css', value: '#go' } }
]

const sidecar = (over: Partial<Sidecar> = {}): Sidecar => ({
  version: 1,
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  steps,
  file: 'spec/checkout_spec.rb',
  automation: 'selenium',
  hash: 'h',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over
})

const generated = (waitHelper: boolean): ReturnType<typeof generateProjectSpecFileWithMap> =>
  generateProjectSpecFileWithMap({ name: 'Checkout', steps }, 'selenium', {
    fileRelPath: 'spec/checkout_spec.rb',
    helperPath: 'helpers',
    waitHelper
  })

describe('sha256Bytes', () => {
  it('hashes the utf-8 bytes', () => {
    const text = 'é\n'
    expect(sha256Bytes(text)).toBe(
      createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex')
    )
  })
})

describe('deriveStepLines', () => {
  it('an old-style file gets the map of the variant without the wait helper', () => {
    const old = generated(false)
    expect(deriveStepLines(sidecar(), old.content, 'helpers')).toEqual(old.stepLines)
  })

  it('a wait-helper file gets the map of the helper variant', () => {
    const helper = generated(true)
    expect(helper.content).not.toBe(generated(false).content)
    expect(deriveStepLines(sidecar(), helper.content, 'helpers')).toEqual(helper.stepLines)
  })

  it('a file with an extra comment line has no map', () => {
    const edited = generated(false).content.replace('  it ', '  # note\n  it ')
    expect(deriveStepLines(sidecar(), edited, 'helpers')).toBeNull()
  })
})

describe('usableStepLines', () => {
  it('uses the stored map only while the bytes match', () => {
    const { content, stepLines } = generated(false)
    expect(usableStepLines(sidecar({ stepLines }), content)).toEqual(stepLines)
    expect(usableStepLines(sidecar({ stepLines }), `${content}\n`)).toBeNull()
    expect(usableStepLines(sidecar(), content)).toBeNull()
  })
})
