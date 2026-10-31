// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => os.tmpdir()) } }))
vi.mock('../../../src/main/handlers/tests/projectTestIpc', () => ({
  listedFiles: vi.fn()
}))

import { appState } from '../../../src/main/handlers/appState'
import { listedFiles } from '../../../src/main/handlers/tests/projectTestIpc'
import { runnableFiles } from '../../../src/main/handlers/run/runnableFiles'

describe('runnableFiles', () => {
  let project: string
  let outside: string

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'runnable-project-'))
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'runnable-outside-'))
    fs.mkdirSync(path.join(project, 'features', 'sub'), { recursive: true })
    fs.writeFileSync(path.join(project, 'features', 'a.feature'), 'Feature: a\n')
    fs.writeFileSync(path.join(project, 'features', 'sub', 'b.feature'), 'Feature: b\n')
    fs.writeFileSync(path.join(project, 'features', 'notes.txt'), 'notes\n')
    fs.writeFileSync(path.join(outside, 'x.feature'), 'Feature: x\n')
    fs.symlinkSync(path.join(outside, 'x.feature'), path.join(project, 'features', 'out.feature'))
    appState.projectPath = project
  })

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('accepts a feature and a nested feature in a cucumber project', async () => {
    await expect(
      runnableFiles(['features/a.feature', 'features/sub/b.feature'], 'cucumber')
    ).resolves.toBeUndefined()
  })

  it.each([
    '../x.feature',
    '/abs/a.feature',
    'features\\a.feature',
    'features/notes.txt',
    'features/missing.feature',
    'features/out.feature'
  ])('rejects %s', async (f) => {
    await expect(runnableFiles([f], 'cucumber')).rejects.toThrow(`Not a project test: ${f}`)
  })

  it('rspec projects still go through listedFiles', async () => {
    vi.mocked(listedFiles).mockRejectedValueOnce(new Error('Not a project test: spec/x_spec.rb'))
    await expect(runnableFiles(['spec/x_spec.rb'], 'rspec')).rejects.toThrow(
      'Not a project test: spec/x_spec.rb'
    )
  })
})
