import { describe, it, expect } from 'vitest'
import { recordedTestForFile } from '@foundation/recordedTestForFile'
import type { Test } from '@foundation/Types/test'

const make = (id: string, over: Partial<Test>): Test =>
  ({ id, name: id, steps: [], ownership: 'recorded', ...over }) as Test


describe('recordedTestForFile', () => {
  it('matches a recorded test by file, ignoring a leading ./', () => {
    const t = make('t1', { file: 'spec/a_spec.rb' })
    expect(recordedTestForFile([t], './spec/a_spec.rb')).toBe(t)
  })

  it('ignores code tests and other files', () => {
    const code = make('t2', { file: 'spec/a_spec.rb', ownership: 'code' })
    const other = make('t3', { file: 'spec/b_spec.rb' })
    expect(recordedTestForFile([code, other], 'spec/a_spec.rb')).toBeUndefined()
    expect(recordedTestForFile([other], undefined)).toBeUndefined()
  })
})
