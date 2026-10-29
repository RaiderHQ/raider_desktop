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
})
