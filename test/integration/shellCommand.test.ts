import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { appState } from '../../src/main/handlers/appState'
import { buildShellCommand, shellQuote } from '../../src/main/utils/shellCommand'

// A folder name a user could really pick, with every character the shell would act on
const NASTY = 'QA\'s "tests" $HOME `whoami` $(echo x)'

describe('buildShellCommand', () => {
  let root: string

  beforeEach(async () => {
    appState.rubyVersion = null
    root = await mkdtemp(join(tmpdir(), 'raider-shell-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('quotes the project path so the shell takes it literally', () => {
    const command = buildShellCommand(`/p/${NASTY}`, 'pwd')
    expect(command).toContain(`cd ${shellQuote(`/p/${NASTY}`)} && pwd`)
    expect(shellQuote(`/p/${NASTY}`)).toBe(`'/p/QA'\\''s "tests" $HOME \`whoami\` $(echo x)'`)
  })

  it.skipIf(process.platform === 'win32')(
    'runs in a folder whose name has quotes, $ and backticks',
    async () => {
      const project = join(root, NASTY)
      await mkdir(project)
      const out = execFileSync('/bin/sh', ['-c', buildShellCommand(project, 'pwd -P')], {
        encoding: 'utf-8'
      })
      expect(out.trim().split('\n').at(-1)).toBe(await realpath(project))
    }
  )

  it('pins a Ruby version as one shell word', () => {
    expect(buildShellCommand('/p', 'pwd', '3.3.0')).toContain('export RBENV_VERSION=3.3.0 && ')
  })

  describe('on win32', () => {
    const platform = process.platform
    beforeEach(() => Object.defineProperty(process, 'platform', { value: 'win32' }))
    afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))

    it('double-quotes the project path for cmd.exe, never single quotes', () => {
      expect(buildShellCommand('C:\\Users\\Jo Ann\\say "hi" $x', 'rspec')).toBe(
        'cd /d "C:\\Users\\Jo Ann\\say ""hi"" $x" && rspec'
      )
    })

    it('shellQuote double-quotes for cmd.exe', () => {
      expect(shellQuote("spec/it's a_spec.rb")).toBe(`"spec/it's a_spec.rb"`)
    })

    it('shellQuote ignores the index when used as an Array#map callback', () => {
      expect(['a b', 'c d'].map(shellQuote)).toEqual(['"a b"', '"c d"'])
    })
  })
})

describe.skipIf(process.platform === 'win32')('shellQuote', () => {
  it('is quoteShellArg for the current platform', () => {
    expect(shellQuote('spec/a_spec.rb')).toBe('spec/a_spec.rb')
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })

  it('passes paths with spaces, quotes and $ to the command unchanged', () => {
    const args = ['spec/my tests/a_spec.rb', `spec/it's "x"_spec.rb`, 'spec/$HOME_spec.rb', NASTY]
    const out = execFileSync('/bin/sh', ['-c', `printf '%s\\n' ${args.map(shellQuote).join(' ')}`], {
      encoding: 'utf-8'
    })
    expect(out.split('\n').slice(0, -1)).toEqual(args)
  })
})
