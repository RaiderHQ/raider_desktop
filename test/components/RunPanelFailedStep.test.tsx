import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router'
import RunPanel from '@components/RunPanel'
import { useRunStore } from '@foundation/Stores/runStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { fixInTestRoute } from '@foundation/recordedTestForFile'
import type { RunView } from '@foundation/run/runModel'
import en from '@assets/translations/en.json'

// The list's own loading is not under test: the tests come from the store
vi.mock('../../src/renderer/src/hooks/useTestsList', async () => {
  const { useTestsListStore } = await import('@foundation/Stores/testsListStore')
  return { useRecordedTests: () => useTestsListStore((s) => s.tests) }
})

const text = (key: string, values?: Record<string, unknown>): string => {
  const found = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
  const raw = typeof found === 'string' ? found : key
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? ''))
}

vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: text }) }))

const ID = 'spec/a_spec.rb[1:1]'
const recordedTest = (label: string) => ({
  id: ID,
  name: 'Checkout',
  ownership: 'recorded',
  file: 'spec/a_spec.rb',
  steps: [{ id: 'a', kind: 'click', element: { label, selectors: [] } }]
})

const resultsJson = (finishedAt: string | null, identifier = ID): string =>
  JSON.stringify({
    run: finishedAt ? { finished_at: finishedAt } : {},
    results: [
      {
        identifier,
        file_path: './spec/a_spec.rb',
        full_name: 'Checkout',
        status: 'failed',
        failure: {
          message: '{"method":"css selector","selector":"#btn-x"}',
          exception_class: 'Selenium::WebDriver::Error::NoSuchElementError',
          backtrace: ['spec/a_spec.rb:3']
        }
      }
    ]
  })

const makeRun = (over: Partial<RunView> = {}, file = 'spec/a_spec.rb'): RunView => ({
  runId: 'r1',
  projectPath: '/work/shop',
  scope: { kind: 'all' } as RunView['scope'],
  workers: 1,
  liveEvents: true,
  startedAt: '2026-10-31T10:00:00.000Z',
  phase: 'running',
  tests: { [ID]: { id: ID, file, line: 1, description: 'x', fullName: 'x', state: 'failed' } },
  order: [ID],
  output: [],
  outputSize: 0,
  outputTrimmed: false,
  finished: {
    status: 'failed',
    counts: { total: 1, passed: 0, failed: 1, quarantined: 0, pending: 0, skipped: 0 },
    exitCode: 1,
    finishedAt: '2026-10-31T10:00:05.000Z'
  },
  ...over
})

const setRun = (run: RunView): void =>
  useRunStore.setState({ run, origin: { route: '/tests', label: 'Tests' }, isActive: false })

const api = { readDirectory: vi.fn(), readFile: vi.fn(), mapFailedStep: vi.fn() }
const ui = (
  <MemoryRouter>
    <RunPanel routeKey="/tests" />
  </MemoryRouter>
)
const load = (data: string): void => {
  api.readFile.mockResolvedValue({ success: true, data })
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.readDirectory.mockResolvedValue([
    { name: 'run.json', type: 'file', path: '/work/shop/raider-results/run.json' }
  ])
  api.mapFailedStep.mockResolvedValue({ stepId: 'a', index: 0 })
  load(resultsJson('2026-10-31T10:00:05.000Z'))
  window.api = {
    ...api,
    setActiveProject: vi.fn().mockResolvedValue({})
  } as unknown as typeof window.api
  useProjectStore.setState({ projectPath: '/work/shop' })
  useTestsListStore.setState({ tests: [recordedTest('Save')] as never })
})
afterEach(() => useTestsListStore.setState({ tests: [] }))

describe('RunPanel failed recorded tests', () => {
  it('shows the plain line and Fix in test, loading results once per run', async () => {
    setRun(makeRun())
    const { rerender } = render(ui)
    expect(await screen.findByTestId('run-failed-step-line')).toHaveTextContent(
      'Failed at step 1: Click "Save". Couldn\'t find "Save".'
    )
    expect(screen.getByText('Fix in test')).toHaveAttribute(
      'href',
      `/${fixInTestRoute(ID).slice(1)}`
    )
    expect(screen.queryByText(/#btn-x/)).toBeNull()
    const loads = api.readDirectory.mock.calls.length
    rerender(ui)
    useTestsListStore.setState({ tests: [recordedTest('Save')] as never })
    await Promise.resolve()
    expect(api.readDirectory).toHaveBeenCalledTimes(loads)
  })

  it('says the element could not be found for an unlabelled element', async () => {
    useTestsListStore.setState({ tests: [recordedTest('')] as never })
    setRun(makeRun())
    render(ui)
    expect(await screen.findByTestId('run-failed-step-line')).toHaveTextContent(
      "Couldn't find this element."
    )
    expect(screen.queryByText(/#btn-x/)).toBeNull()
  })

  it('loads no results for a failed code test', async () => {
    useTestsListStore.setState({ tests: [] })
    setRun(makeRun())
    render(ui)
    await Promise.resolve()
    expect(api.readDirectory).not.toHaveBeenCalled()
    expect(screen.queryByTestId('run-failed-step-line')).toBeNull()
  })

  it('ignores a result with another identifier', async () => {
    load(resultsJson('2026-10-31T10:00:05.000Z', 'spec/other_spec.rb[1:1]'))
    setRun(makeRun())
    render(ui)
    await waitFor(() => expect(api.readFile).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByTestId('run-failed-step-line')).toBeNull()
    expect(api.mapFailedStep).not.toHaveBeenCalled()
  })

  it('shows no line for an errored run that left an older run.json', async () => {
    load(resultsJson('2026-10-30T09:00:00.000Z'))
    setRun(
      makeRun({
        finished: {
          status: 'errored',
          counts: { total: 0, passed: 0, failed: 0, quarantined: 0, pending: 0, skipped: 0 },
          exitCode: 1,
          finishedAt: '2026-10-31T10:00:05.000Z'
        }
      })
    )
    render(ui)
    await waitFor(() => expect(api.readFile).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByTestId('run-failed-step-line')).toBeNull()
  })

  describe('a flow run', () => {
    const DIR = 'flow-results/checkout/20261031T100005Z'
    const flowFinished = (resultsDir: string | null): RunView['finished'] => ({
      ...makeRun().finished!,
      flow: { name: 'checkout', status: 'failed', resultsDir, failedStep: null }
    })

    it('reads its own results folder, not raider-results', async () => {
      api.readDirectory.mockResolvedValue([
        { name: 'run.json', type: 'file', path: `/work/shop/${DIR}/run.json` }
      ])
      setRun(makeRun({ finished: flowFinished(DIR) }))
      render(ui)
      expect(await screen.findByTestId('run-failed-step-line')).toHaveTextContent(
        'Failed at step 1'
      )
      expect(api.readDirectory).toHaveBeenCalledWith(`/work/shop/${DIR}`)
      expect(api.readDirectory).not.toHaveBeenCalledWith('/work/shop/raider-results')
    })

    it('reads nothing when the gem logged no results folder', async () => {
      setRun(makeRun({ finished: flowFinished(null) }))
      render(ui)
      await Promise.resolve()
      await Promise.resolve()
      expect(api.readDirectory).not.toHaveBeenCalled()
      expect(screen.queryByTestId('run-failed-step-line')).toBeNull()
    })
  })

  it("does not paint one run's line on the next run", async () => {
    setRun(makeRun())
    render(ui)
    await screen.findByTestId('run-failed-step-line')
    api.readFile.mockReturnValue(new Promise(() => {}))
    setRun(
      makeRun({
        runId: 'r2',
        startedAt: '2026-10-31T11:00:00.000Z',
        finished: { ...makeRun().finished!, finishedAt: '2026-10-31T11:00:05.000Z' }
      })
    )
    await waitFor(() => expect(screen.queryByTestId('run-failed-step-line')).toBeNull())
  })
})
