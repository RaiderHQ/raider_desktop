// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn() }, BrowserWindow: vi.fn() }))

import { buildRunCommand, validateTags } from '../../../src/main/handlers/run/runCommand'
import { shellQuote } from '../../../src/main/utils/shellCommand'

const base = { rubyCommand: 'ruby' }
const file = 'spec/a b_spec.rb'

describe('buildRunCommand', () => {
  it('runs all rspec serially', () => {
    expect(
      buildRunCommand({ ...base, framework: 'rspec', scope: { kind: 'all' }, workers: 1 })
    ).toEqual({
      command: 'ruby -S bundle exec rspec',
      workers: 1
    })
  })

  it('quotes file paths', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'rspec',
      scope: { kind: 'files', files: [file] },
      workers: 1
    })
    expect(command).toBe(`ruby -S bundle exec rspec ${shellQuote(file)}`)
  })

  it('ORs rspec tags with repeated --tag', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'rspec',
      scope: { kind: 'tags', tags: ['smoke', 'ui'] },
      workers: 1
    })
    expect(command).toBe('ruby -S bundle exec rspec --tag smoke --tag ui')
  })

  it('ORs cucumber tags in one --tags', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'cucumber',
      scope: { kind: 'tags', tags: ['smoke', 'ui'] },
      workers: 1
    })
    expect(command).toBe(`ruby -S bundle exec cucumber --tags ${shellQuote('@smoke or @ui')}`)
  })

  it('runs all rspec in parallel against spec', () => {
    expect(
      buildRunCommand({ ...base, framework: 'rspec', scope: { kind: 'all' }, workers: 3 })
    ).toEqual({
      command: 'ruby -S bundle exec parallel_rspec -n 3 --prefix-output-with-test-env-number spec',
      workers: 3
    })
  })

  it('runs all cucumber in parallel against features', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'cucumber',
      scope: { kind: 'all' },
      workers: 2
    })
    expect(command).toBe(
      'ruby -S bundle exec parallel_cucumber -n 2 --prefix-output-with-test-env-number features'
    )
  })

  it('passes rspec tags to parallel workers via -o', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'rspec',
      scope: { kind: 'tags', tags: ['smoke'] },
      workers: 3
    })
    expect(command).toContain(`-o ${shellQuote('--tag smoke')}`)
    expect(command).toContain('parallel_rspec -n 3 --prefix-output-with-test-env-number')
  })

  it('passes the cucumber tag expression to parallel workers quoted for the shell', () => {
    const { command } = buildRunCommand({
      ...base,
      framework: 'cucumber',
      scope: { kind: 'tags', tags: ['smoke', 'ui'] },
      workers: 3
    })
    expect(command).toContain(`-o ${shellQuote(`--tags ${shellQuote('@smoke or @ui')}`)}`)
  })

  it('passes cucumber files to parallel_cucumber', () => {
    const f = 'features/a b.feature'
    const { command } = buildRunCommand({
      ...base,
      framework: 'cucumber',
      scope: { kind: 'files', files: [f] },
      workers: 3
    })
    expect(command).toBe(
      `ruby -S bundle exec parallel_cucumber -n 3 --prefix-output-with-test-env-number ${shellQuote(f)}`
    )
  })

  it('runs locations serially whatever the worker count', () => {
    const result = buildRunCommand({
      ...base,
      framework: 'rspec',
      scope: { kind: 'locations', locations: ['spec/a_spec.rb:12'] },
      workers: 3
    })
    expect(result.workers).toBe(1)
    expect(result.command).toBe(`ruby -S bundle exec rspec ${shellQuote('spec/a_spec.rb:12')}`)
  })

  it('rejects an invalid tag', () => {
    expect(() =>
      buildRunCommand({
        ...base,
        framework: 'rspec',
        scope: { kind: 'tags', tags: ['a;rm'] },
        workers: 1
      })
    ).toThrow('Invalid tag: a;rm')
  })

  it('rejects an invalid ruby command', () => {
    expect(() =>
      buildRunCommand({
        framework: 'rspec',
        scope: { kind: 'all' },
        workers: 1,
        rubyCommand: 'ruby; rm -rf /'
      })
    ).toThrow('The Ruby command is not valid, so the tests were not run.')
  })
})

describe('validateTags', () => {
  it('accepts plain tags', () => {
    expect(() => validateTags(['smoke', 'a:b', 'x_y-1'])).not.toThrow()
  })
})
