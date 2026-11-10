import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  resolveFailedStep,
  failedStepLine,
  useFailedStep,
  useFailedStepFor
} from '../src/renderer/src/hooks/useFailedStep'
import { useRunStore } from '@foundation/Stores/runStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import type { RunView } from '@foundation/run/runModel'
import type { Test } from '@shared/types/test'
import type { TestResult } from '@foundation/Types/testResult'

const save = { strategy: 'id' as const, value: 'save', label: 'Save' }
const test: Test = {
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  file: 'spec/checkout_spec.rb',
  ownership: 'recorded',
  steps: [
    { id: 'a', kind: 'navigate', url: 'https://x.test' },
    { id: 'b', kind: 'navigate', url: 'https://x.test/cart' },
    { id: 'c', kind: 'click', element: save }
  ]
}

const failed: TestResult = {
  name: 'Checkout',
  status: 'failed',
  file: 'spec/checkout_spec.rb',
  finishedAt: '2026-11-02T10:00:00Z',
  failure: {
    message: 'Unable to locate element',
    exceptionClass: 'Selenium::WebDriver::Error::NoSuchElementError',
    backtrace: ['spec/checkout_spec.rb:9:in `block`'],
    appFrame: 'spec/checkout_spec.rb:9:in `block`'
  }
}

const mapFailedStep = vi.fn()

beforeEach(() => {
  mapFailedStep.mockReset()
  window.api = { mapFailedStep } as unknown as typeof window.api
})

describe('resolveFailedStep', () => {
  it('gives the mapped step, its index and the plain reason', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const state = await resolveFailedStep('/p', test, failed)
    expect(state).toMatchObject({ status: 'mapped', index: 2, step: test.steps[2], result: failed })
    expect(state.status === 'mapped' && state.reason.key).toBe('failedStep.reason.notFound')
    expect(mapFailedStep).toHaveBeenCalledWith('/p', 't1', {
      file: 'spec/checkout_spec.rb',
      backtrace: failed.failure!.backtrace,
      appFrame: failed.failure!.appFrame,
      finishedAt: '2026-11-02T10:00:00Z'
    })
  })

  it('gives unmapped for noMap and outsideSteps', async () => {
    mapFailedStep.mockResolvedValue({ none: 'noMap' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({
      status: 'unmapped',
      result: failed
    })
    mapFailedStep.mockResolvedValue({ none: 'outsideSteps' })
    expect((await resolveFailedStep('/p', test, failed)).status).toBe('unmapped')
  })

  it('gives changedSinceRun when the mapped step is no longer in the test', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'gone', index: 2 })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({
      status: 'changedSinceRun',
      result: failed
    })
  })

  it('gives changedSinceRun', async () => {
    mapFailedStep.mockResolvedValue({ none: 'changedSinceRun' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({
      status: 'changedSinceRun',
      result: failed
    })
  })

  it('gives none for an edited or unrecorded test', async () => {
    mapFailedStep.mockResolvedValue({ none: 'edited' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({ status: 'none' })
    mapFailedStep.mockResolvedValue({ none: 'notRecorded' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({ status: 'none' })
  })

  it('maps a quarantined result like a failed one: it carries a real failure', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const quarantined = { ...failed, status: 'quarantined' }
    expect(await resolveFailedStep('/p', test, quarantined)).toMatchObject({
      status: 'mapped',
      index: 2,
      result: quarantined
    })
  })

  it('gives none for a passed result, without asking main', async () => {
    const passed = { ...failed, status: 'passed' }
    expect(await resolveFailedStep('/p', test, passed)).toEqual({ status: 'none' })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })

  it('gives none for a result without a failure', async () => {
    const { failure: _failure, ...bare } = failed
    expect(await resolveFailedStep('/p', test, bare)).toEqual({ status: 'none' })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })

  it('gives none for a test the user wrote in code', async () => {
    expect(await resolveFailedStep('/p', { ...test, ownership: 'code' }, failed)).toEqual({
      status: 'none'
    })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })
})

describe('failedStepLine', () => {
  const t = ((key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key) as Parameters<typeof failedStepLine>[0]

  it('names the step and the reason for a mapped failure', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const state = await resolveFailedStep('/p', test, failed)
    expect(failedStepLine(t, state)).toBe(
      'failedStep.title {"n":3,"step":"recorder.commandParser.clickElement {\\"element\\":\\"Save\\"}"}. ' +
        'failedStep.reason.notFound {"element":"\\"Save\\""}'
    )
  })

  it('gives the plain line for unmapped and changed, and null for none', () => {
    expect(failedStepLine(t, { status: 'unmapped', result: failed })).toBe('failedStep.unmapped')
    expect(failedStepLine(t, { status: 'changedSinceRun', result: failed })).toBe(
      'failedStep.changedSinceRun'
    )
    expect(failedStepLine(t, { status: 'none' })).toBeNull()
  })
})

const runJson = (file: string, status = 'failed'): string =>
  JSON.stringify({
    run: { finished_at: '2026-11-02T10:00:00Z' },
    results: [
      {
        full_name: 'Checkout',
        file_path: `./${file}`,
        status,
        failure: { message: 'Unable to locate element', backtrace: [`${file}:9`] }
      }
    ]
  })

const finishedRun = (
  projectPath: string,
  scope: RunView['scope'],
  files: string[],
  finishedAt: string
): RunView =>
  ({
    projectPath,
    scope,
    order: files.map((_, i) => `e${i}`),
    tests: Object.fromEntries(files.map((f, i) => [`e${i}`, { id: `e${i}`, file: `./${f}` }])),
    finished: { finishedAt }
  }) as unknown as RunView

describe('useFailedStep', () => {
  // Each project's raider-results/run.json, as the test sets it
  let runs: Record<string, string>
  const readDirectory = vi.fn(async (dir: string) => {
    const project = dir.replace(/\/raider-results$/, '')
    return project in runs
      ? [{ name: 'run.json', type: 'file', path: `${project}/raider-results/run.json` }]
      : []
  })
  const readFile = vi.fn(async (path: string) => {
    const project = path.replace(/\/raider-results\/run\.json$/, '')
    return project in runs ? { success: true, data: runs[project] } : { success: false }
  })

  beforeEach(() => {
    runs = { '/p': runJson('spec/checkout_spec.rb') }
    readDirectory.mockClear()
    readFile.mockClear()
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    window.api = { mapFailedStep, readDirectory, readFile } as unknown as typeof window.api
    useRunStore.setState({ run: null })
    useRecorderStore.setState({ recordingTarget: null })
  })

  const mount = (projectPath: string | null = '/p', t: Test | null = test) =>
    renderHook(({ p, tt }) => useFailedStep(p, tt), { initialProps: { p: projectPath, tt: t } })

  it('shows the mapped step of the newest failed run of the test file', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    expect(readDirectory).toHaveBeenCalledWith('/p/raider-results')
  })

  describe('for a flow', () => {
    const DIR = 'flow-results/checkout/20261102T100000Z'
    const flowTest: Test = { ...test, file: 'flows/checkout_flow.rb' }
    const flowLastResults = vi.fn()
    // This flow's own folder only: raider-results would answer too, so a wrong read shows
    const flowReadDirectory = vi.fn(async (dir: string) =>
      dir === `/p/${DIR}`
        ? [{ name: 'run.json', type: 'file', path: `/p/${DIR}/run.json` }]
        : readDirectory(dir)
    )
    const flowReadFile = vi.fn(async (path: string) =>
      path === `/p/${DIR}/run.json`
        ? { success: true, data: runJson('flows/checkout_flow.rb') }
        : readFile(path)
    )

    beforeEach(() => {
      flowLastResults.mockReset()
      flowReadDirectory.mockClear()
      flowReadFile.mockClear()
      runs = { '/p': runJson('flows/checkout_flow.rb') }
      window.api = {
        mapFailedStep,
        readDirectory: flowReadDirectory,
        readFile: flowReadFile,
        flowLastResults
      } as unknown as typeof window.api
    })

    it("reads the flow's last run folder and passes it on to main", async () => {
      flowLastResults.mockResolvedValue({
        resultsDir: DIR,
        finishedAt: '2026-11-02T10:00:00Z',
        status: 'failed'
      })
      const { result } = mount('/p', flowTest)
      await waitFor(() => expect(result.current.status).toBe('mapped'))
      expect(flowLastResults).toHaveBeenCalledWith('checkout')
      expect(flowReadDirectory).toHaveBeenCalledWith(`/p/${DIR}`)
      expect(flowReadDirectory).not.toHaveBeenCalledWith('/p/raider-results')
      expect(mapFailedStep.mock.calls[0][2]).toMatchObject({ resultsDir: DIR })
    })

    it('shows nothing when the flow has no last run, never raider-results', async () => {
      flowLastResults.mockResolvedValue(null)
      const { result } = mount('/p', flowTest)
      await waitFor(() => expect(flowLastResults).toHaveBeenCalled())
      await Promise.resolve()
      expect(flowReadDirectory).not.toHaveBeenCalled()
      expect(result.current.status).toBe('none')
    })
  })

  it('reloads after a run that included the test file, or the whole project', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    readDirectory.mockClear()
    runs['/p'] = runJson('spec/checkout_spec.rb', 'passed')
    act(() =>
      useRunStore.setState({
        run: finishedRun(
          '/p',
          { kind: 'files', files: ['spec/checkout_spec.rb'] },
          ['spec/checkout_spec.rb'],
          'T1'
        )
      })
    )
    await waitFor(() => expect(result.current.status).toBe('none'))
    expect(readDirectory).toHaveBeenCalledTimes(1)
    act(() => useRunStore.setState({ run: finishedRun('/p', { kind: 'all' }, [], 'T2') }))
    await waitFor(() => expect(readDirectory).toHaveBeenCalledTimes(2))
  })

  it('does not reload after a run of another file or another project', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    readDirectory.mockClear()
    act(() =>
      useRunStore.setState({
        run: finishedRun(
          '/p',
          { kind: 'files', files: ['spec/other_spec.rb'] },
          ['spec/other_spec.rb'],
          'T1'
        )
      })
    )
    act(() =>
      useRunStore.setState({
        run: finishedRun(
          '/q',
          { kind: 'files', files: ['spec/checkout_spec.rb'] },
          ['spec/checkout_spec.rb'],
          'T2'
        )
      })
    )
    act(() =>
      useRunStore.setState({
        run: finishedRun('/p', { kind: 'tags', tags: ['smoke'] }, ['spec/other_spec.rb'], 'T3')
      })
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(readDirectory).not.toHaveBeenCalled()
    expect(result.current.status).toBe('mapped')
  })

  it('drops the shown result at once when the project or the test changes', async () => {
    runs['/q'] = runJson('spec/checkout_spec.rb')
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    // The other project's results never arrive: nothing from /p may show meanwhile
    readDirectory.mockImplementationOnce(() => new Promise(() => {}))
    rerender({ p: '/q', tt: test })
    expect(result.current.status).toBe('none')

    rerender({ p: '/p', tt: test })
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    readDirectory.mockImplementationOnce(() => new Promise(() => {}))
    rerender({ p: '/p', tt: { ...test, id: 't2' } })
    expect(result.current.status).toBe('none')
  })

  it('shows nothing and asks nothing while recording, then looks again', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    mapFailedStep.mockClear()
    readDirectory.mockClear()
    act(() => useRecorderStore.setState({ recordingTarget: { kind: 'test' } }))
    expect(result.current.status).toBe('none')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(mapFailedStep).not.toHaveBeenCalled()
    expect(readDirectory).not.toHaveBeenCalled()
    act(() => useRecorderStore.setState({ recordingTarget: null }))
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    expect(readDirectory).toHaveBeenCalledTimes(1)
    expect(mapFailedStep).toHaveBeenCalledTimes(1)
  })
})

describe('useFailedStepFor', () => {
  beforeEach(() => {
    useTestsListStore.setState({ tests: [] })
  })

  it('is pending until main answers, and not once it answered none', async () => {
    let answer: (map: unknown) => void = () => {}
    mapFailedStep.mockReturnValue(new Promise((r) => (answer = r)))
    const { result } = renderHook(() => useFailedStepFor('/p', test, failed))
    expect(result.current).toEqual({ status: 'none', pending: true })
    await act(async () => answer({ none: 'notRecorded' }))
    expect(result.current).toEqual({ status: 'none', pending: false })
  })

  it('is not pending with nothing to look up', () => {
    const { result } = renderHook(() => useFailedStepFor('/p', test, null))
    expect(result.current.pending).toBe(false)
  })

  it('asks again only when the saved test or its steps change, not on each edit', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    useTestsListStore.setState({ tests: [test] })
    const { result, rerender } = renderHook(({ tt }) => useFailedStepFor('/p', tt, failed), {
      initialProps: { tt: test }
    })
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    expect(mapFailedStep).toHaveBeenCalledTimes(1)

    // An edit not saved yet: same steps, a new value
    const edited: Test = {
      ...test,
      steps: test.steps.map((s) => (s.id === 'b' ? { ...s, url: 'https://x.test/basket' } : s))
    }
    rerender({ tt: edited })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(mapFailedStep).toHaveBeenCalledTimes(1)

    // Saved: main's copy of the test changed
    act(() => useTestsListStore.setState({ tests: [edited] }))
    await waitFor(() => expect(mapFailedStep).toHaveBeenCalledTimes(2))

    // A step added or removed
    rerender({ tt: { ...edited, steps: edited.steps.slice(0, 2) } })
    await waitFor(() => expect(mapFailedStep).toHaveBeenCalledTimes(3))
  })

  it("never shows one project's answer for the same test id in another", async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const { result, rerender } = renderHook(({ p }) => useFailedStepFor(p, test, failed), {
      initialProps: { p: '/p' }
    })
    await waitFor(() => expect(result.current.status).toBe('mapped'))
    mapFailedStep.mockImplementation(() => new Promise(() => {}))
    rerender({ p: '/q' })
    expect(result.current.status).toBe('none')
  })
})
