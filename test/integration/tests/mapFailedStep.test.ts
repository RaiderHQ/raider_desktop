import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))

import { appState } from '../../../src/main/handlers/appState'
import { mapFailedStepHandler } from '../../../src/main/handlers/tests/mapFailedStep'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar, writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Sidecar } from '../../../src/shared/types/projectTest'
import type { FailedStepQuery } from '../../../src/shared/types/failedStep'

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  waitHelper: false,
  recordable: true
}

let root: string
let project: string
let link: string
let saved: Sidecar
let finishedAt: string

const rangeOf = (i: number): { start: number; end: number } => saved.stepLines!.ranges[i]

const frame = (line: number): string => `./spec/x_spec.rb:${line}:in 'block (2 levels)'`

const query = (over: Partial<FailedStepQuery> = {}): FailedStepQuery => ({
  file: 'spec/x_spec.rb',
  backtrace: [],
  finishedAt,
  ...over
})

const map = (failure: unknown, path: unknown = project, id: unknown = 't1') =>
  mapFailedStepHandler(path, id, failure)

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'raider-map-')))
  project = join(root, 'proj')
  link = join(root, 'link')
  await mkdir(join(project, 'spec'), { recursive: true })
  await symlink(project, link)
  appState.projectPath = project
  appState.layout = layout
  saved = await saveRecordedTest(project, layout, {
    id: 't1',
    name: 'X',
    url: 'https://x.test',
    steps: [1, 2, 3, 4].map((n) => ({
      id: `s${n}`,
      kind: 'navigate' as const,
      url: `https://x.test/${n}`
    }))
  })
  finishedAt = new Date(Date.parse(saved.updatedAt) + 60_000).toISOString()
})

afterEach(async () => {
  appState.projectPath = ''
  appState.layout = null
  await rm(root, { recursive: true, force: true })
})

describe('mapFailedStepHandler', () => {
  it('maps a backtrace frame inside a step to that step', async () => {
    expect(await map(query({ backtrace: [frame(rangeOf(2).start)] }))).toEqual({
      stepId: 's3',
      index: 2
    })
  })

  it('falls back to the app frame when the backtrace is empty', async () => {
    expect(await map(query({ appFrame: frame(rangeOf(2).start) }))).toEqual({
      stepId: 's3',
      index: 2
    })
  })

  it('skips frames of other files', async () => {
    const failure = query({
      backtrace: ['helpers/wait_helper.rb:30:in x', `./spec/x_spec.rb:${rangeOf(2).start}`]
    })
    expect(await map(failure)).toEqual({ stepId: 's3', index: 2 })
  })

  it('maps an absolute real path when the project is open through a symlink', async () => {
    appState.projectPath = link
    const abs = `${await realpath(project)}/spec/x_spec.rb:${rangeOf(2).start}`
    expect(await map(query({ backtrace: [abs] }), link)).toEqual({ stepId: 's3', index: 2 })
  })

  it('reports the it line as outside the steps', async () => {
    expect(await map(query({ backtrace: [frame(rangeOf(0).start - 1)] }))).toEqual({
      none: 'outsideSteps'
    })
  })

  it('still maps without a finishedAt', async () => {
    const failure = query({ backtrace: [frame(rangeOf(2).start)], finishedAt: undefined })
    expect(await map(failure)).toEqual({ stepId: 's3', index: 2 })
  })

  it('refuses a run that finished before the last save', async () => {
    const before = new Date(Date.parse(saved.updatedAt) - 60_000).toISOString()
    const failure = query({ backtrace: [frame(rangeOf(2).start)], finishedAt: before })
    expect(await map(failure)).toEqual({ none: 'changedSinceRun' })
  })

  it('has no map when the file changed but is still the same generation', async () => {
    const file = join(project, saved.file)
    await writeFile(file, (await readFile(file, 'utf-8')) + '# note\n')
    const { stepLines, ...bare } = (await readSidecar(project, saved.file))!
    void stepLines
    await writeSidecar(project, bare)
    expect(await map(query({ backtrace: [frame(rangeOf(2).start)] }))).toEqual({ none: 'noMap' })
  })

  it('reports an edited file', async () => {
    const file = join(project, saved.file)
    await writeFile(file, (await readFile(file, 'utf-8')).replace('https://x.test/3', 'https://y'))
    expect(await map(query({ backtrace: [frame(rangeOf(2).start)] }))).toEqual({ none: 'edited' })
  })

  it('reports an unknown test as not recorded', async () => {
    expect(await map(query({ backtrace: [frame(5)] }), project, 'nope')).toEqual({
      none: 'notRecorded'
    })
  })

  it('reports a different project as not recorded', async () => {
    expect(await map(query({ backtrace: [frame(5)] }), join(root, 'other'))).toEqual({
      none: 'notRecorded'
    })
  })

  it('reports a failure in another file as not recorded', async () => {
    const failure = query({ file: 'spec/other_spec.rb', backtrace: [frame(rangeOf(2).start)] })
    expect(await map(failure)).toEqual({ none: 'notRecorded' })
  })

  it('reports bad arguments as not recorded', async () => {
    expect(await map(null)).toEqual({ none: 'notRecorded' })
    expect(await map(query(), 42)).toEqual({ none: 'notRecorded' })
  })
})
