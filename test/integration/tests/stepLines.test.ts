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
  hash: 'h',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over
})

const generated = (): ReturnType<typeof generateProjectSpecFileWithMap> =>
  generateProjectSpecFileWithMap(
    { name: 'Checkout', steps },
    { fileRelPath: 'spec/checkout_spec.rb', helperPath: 'helpers' }
  )

describe('sha256Bytes', () => {
  it('hashes the utf-8 bytes', () => {
    const text = 'é\n'
    expect(sha256Bytes(text)).toBe(
      createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex')
    )
  })
})

describe('deriveStepLines', () => {
  it('a file that matches the render byte for byte gets its map', () => {
    const current = generated()
    expect(deriveStepLines(sidecar(), current.content, 'helpers')).toEqual(current.stepLines)
  })

  it('a file with CRLF line endings has no map', () => {
    const crlf = generated().content.replace(/\n/g, '\r\n')
    expect(deriveStepLines(sidecar(), crlf, 'helpers')).toBeNull()
    expect(usableStepLines(sidecar({ stepLines: generated().stepLines }), crlf)).toBeNull()
  })

  it('a file with an extra comment line has no map', () => {
    const edited = generated().content.replace('  it ', '  # note\n  it ')
    expect(deriveStepLines(sidecar(), edited, 'helpers')).toBeNull()
  })
})

describe('usableStepLines', () => {
  it('uses the stored map only while the bytes match', () => {
    const { content, stepLines } = generated()
    expect(usableStepLines(sidecar({ stepLines }), content)).toEqual(stepLines)
    expect(usableStepLines(sidecar({ stepLines }), `${content}\n`)).toBeNull()
    expect(usableStepLines(sidecar(), content)).toBeNull()
  })
})
