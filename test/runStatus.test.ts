import { describe, it, expect } from 'vitest'
import { runStatusOf } from '@foundation/runStatus'

describe('runStatusOf', () => {
  it('a failed run is failed even when rspec counted 0 failures', () => {
    // A load error stops rspec before any example runs
    const output = '0 examples, 0 failures, 1 error occurred outside of examples'
    expect(runStatusOf(output, true)).toBe('fail')
  })

  it('reads pass and fail from rspec output', () => {
    expect(runStatusOf('3 examples, 0 failures', false)).toBe('pass')
    expect(runStatusOf('3 examples, 2 failures', false)).toBe('fail')
  })

  it('shows nothing before a run finishes', () => {
    expect(runStatusOf('', false)).toBeNull()
    expect(runStatusOf('Running test: A...', true)).toBeNull()
  })
})
