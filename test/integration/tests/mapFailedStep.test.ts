import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeLog', () => ({ safeError: vi.fn(), safeLog: vi.fn() }))
vi.mock('../../../src/main/handlers/tests/recordedTests', async (importOriginal) => {
  const orig =
    await importOriginal<typeof import('../../../src/main/handlers/tests/recordedTests')>()
  return {
    ...orig,
    findSidecarById: vi.fn(orig.findSidecarById),
    stepLinesFor: vi.fn(orig.stepLinesFor)
  }
})

import { safeError } from '../../../src/main/utils/safeLog'
import { appState } from '../../../src/main/handlers/appState'
import { mapFailedStepHandler } from '../../../src/main/handlers/tests/mapFailedStep'
import {
  findSidecarById,
  saveRecordedTest,
  stepLinesFor
} from '../../../src/main/handlers/tests/recordedTests'
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

  describe('without a finishedAt', () => {
    const runFile = (): string => join(project, 'raider-results', 'run.json')
    const writeRunAt = async (ms: number): Promise<void> => {
      await mkdir(join(project, 'raider-results'), { recursive: true })
      await writeFile(runFile(), '{}')
      await utimes(runFile(), ms / 1000, ms / 1000)
    }
    const failure = (): FailedStepQuery =>
      query({ backtrace: [frame(rangeOf(2).start)], finishedAt: undefined })

    it('maps when the results file was written after the last save', async () => {
      await writeRunAt(Date.parse(saved.updatedAt) + 60_000)
      expect(await map(failure())).toEqual({ stepId: 's3', index: 2 })
    })

    it('refuses when the results file is older than the last save', async () => {
      await writeRunAt(Date.parse(saved.updatedAt) - 60_000)
      expect(await map(failure())).toEqual({ none: 'changedSinceRun' })
    })

    it('refuses when there is no results file to tell when it ran', async () => {
      expect(await map(failure())).toEqual({ none: 'changedSinceRun' })
    })

    describe("from a flow run's results folder", () => {
      const DIR = 'flow-results/hello/20261110T110856Z'
      const writeFlowRunAt = async (ms: number): Promise<void> => {
        await mkdir(join(project, DIR), { recursive: true })
        await writeFile(join(project, DIR, 'run.json'), '{}')
        await utimes(join(project, DIR, 'run.json'), ms / 1000, ms / 1000)
      }

      it("stats the flow run's run.json, not raider-results", async () => {
        await writeRunAt(Date.parse(saved.updatedAt) - 60_000)
        await writeFlowRunAt(Date.parse(saved.updatedAt) + 60_000)
        expect(await map({ ...failure(), resultsDir: DIR })).toEqual({ stepId: 's3', index: 2 })
      })

      it('never falls back to raider-results when the flow run.json is missing', async () => {
        await writeRunAt(Date.parse(saved.updatedAt) + 60_000)
        expect(await map({ ...failure(), resultsDir: DIR })).toEqual({ none: 'changedSinceRun' })
      })

      it.each(['raider-results', 'flow-results/hello/../x', '/abs', 'flow-results/hello/latest'])(
        'refuses a results folder that is not a flow run: %s',
        async (resultsDir) => {
          await writeRunAt(Date.parse(saved.updatedAt) + 60_000)
          expect(await map({ ...failure(), resultsDir })).toEqual({ none: 'notRecorded' })
        }
      )
    })

    it('treats an unreadable finishedAt like a missing one', async () => {
      expect(
        await map(query({ backtrace: [frame(rangeOf(2).start)], finishedAt: 'soon' }))
      ).toEqual({ none: 'changedSinceRun' })
    })
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

  it('reports a different project as not recorded without reading anything', async () => {
    vi.mocked(findSidecarById).mockClear()
    vi.mocked(stepLinesFor).mockClear()
    expect(await map(query({ backtrace: [frame(5)] }), join(root, 'other'))).toEqual({
      none: 'notRecorded'
    })
    expect(findSidecarById).not.toHaveBeenCalled()
    expect(stepLinesFor).not.toHaveBeenCalled()
  })

  it('checks the failing file before reporting an edited test', async () => {
    const file = join(project, saved.file)
    await writeFile(file, (await readFile(file, 'utf-8')).replace('https://x.test/3', 'https://y'))
    const failure = query({ file: 'spec/other_spec.rb', backtrace: [frame(rangeOf(2).start)] })
    expect(await map(failure)).toEqual({ none: 'notRecorded' })
  })

  it('reports a stale run before a missing map', async () => {
    const file = join(project, saved.file)
    await writeFile(file, (await readFile(file, 'utf-8')) + '# note\n')
    const { stepLines, ...bare } = (await readSidecar(project, saved.file))!
    void stepLines
    await writeSidecar(project, bare)
    const before = new Date(Date.parse(saved.updatedAt) - 60_000).toISOString()
    expect(await map(query({ finishedAt: before }))).toEqual({ none: 'changedSinceRun' })
  })

  it('reports an edited file before a stale run', async () => {
    const file = join(project, saved.file)
    await writeFile(file, (await readFile(file, 'utf-8')).replace('https://x.test/3', 'https://y'))
    const before = new Date(Date.parse(saved.updatedAt) - 60_000).toISOString()
    expect(await map(query({ finishedAt: before }))).toEqual({ none: 'edited' })
  })

  it('has no map when a range names a step the test lacks', async () => {
    const side = (await readSidecar(project, saved.file))!
    await writeSidecar(project, { ...side, steps: side.steps.filter((s) => s.id !== 's3') })
    expect(await map(query({ backtrace: [frame(rangeOf(2).start)] }))).toEqual({ none: 'noMap' })
  })

  it('never rejects when reading fails, and logs it', async () => {
    vi.mocked(stepLinesFor).mockRejectedValueOnce(new Error('boom'))
    expect(await map(query({ backtrace: [frame(rangeOf(2).start)] }))).toEqual({ none: 'noMap' })
    expect(safeError).toHaveBeenCalled()
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
