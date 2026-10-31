import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import { MemoryRouter, Route, Routes } from 'react-router'
import TestsWorkspace from '@components/TestsWorkspace'
import { toRouteParam } from '@foundation/testKey'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunView } from '@foundation/run/runModel'
import type { Test } from '@foundation/Types/test'
import en from '@assets/translations/en.json'

// The real copy, so the toast text can be checked word for word
const translate = (key: string, options: Record<string, string> = {}): string => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => options[name] ?? '')
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const step = (id: string): Test['steps'][number] => ({
  id,
  kind: 'navigate',
  url: `https://x.test/${id}`
})

const search: Test = {
  id: 't1',
  name: 'Search products',
  url: 'https://x.test/search',
  steps: [step('a')],
  ownership: 'recorded'
}
const checkout: Test = {
  id: 't2',
  name: 'Checkout',
  url: 'https://x.test/checkout',
  steps: [step('c')],
  ownership: 'recorded'
}
const suites = [{ id: 's1', name: 'Smoke', tests: [search, checkout] }]

const listeners = new Map<string, (event: IpcRendererEvent, ...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.({} as IpcRendererEvent, ...args)
  })
}

const api = {
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  saveRecording: vi.fn(),
  saveTrace: vi.fn(),
  stopRecordingMain: vi.fn(),
  cancelReplay: vi.fn(),
  renderStep: vi.fn(),
  setRecordingState: vi.fn(),
  onFlushRecording: vi.fn(() => (): void => {}),
  flushRecordingDone: vi.fn()
}

const keyOf = (test: Test): string => toRouteParam(`id:${test.id}`)

const renderWorkspace = (test: Test = search): void => {
  render(
    <MemoryRouter initialEntries={[`/overview/tests/${keyOf(test)}`]}>
      <Routes>
        <Route path="/overview/tests/:testKey" element={<TestsWorkspace />} />
        <Route path="/overview/tests" element={<TestsWorkspace />} />
      </Routes>
    </MemoryRouter>
  )
}

/** Opens the test, then puts it in recording the way start() and main do. */
const recording = async (test: Test = search): Promise<void> => {
  renderWorkspace(test)
  await screen.findByDisplayValue(test.name)
  act(() => {
    useRecorderStore.getState().setRecordingTarget({ kind: 'test' })
    useRecorderStore.getState().setRecordingBrowser({ url: test.url ?? '', preloadPath: '/p.js' })
  })
  await emit('recording-started', test.url)
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  api.getSuites.mockResolvedValue(suites)
  api.listProjectTests.mockResolvedValue([
    {
      name: 'Search products',
      file: 'spec/search_products_spec.rb',
      testId: 't1',
      ownership: 'recorded'
    },
    { name: 'Checkout', file: 'spec/checkout_spec.rb', testId: 't2', ownership: 'recorded' }
  ])
  api.saveRecording.mockImplementation(async (_suiteId: string, test: Test) => ({
    success: true,
    test: { ...test, file: 'spec/search_products_spec.rb' }
  }))
  api.saveTrace.mockResolvedValue({ success: true })
  api.renderStep.mockImplementation(async (s: { url?: string }) => `goto ${s.url ?? ''}`)
  // @ts-expect-error - Mocking window.api
  window.api = api
  window.electron = {
    ipcRenderer: {
      on: (channel: string, cb: (event: IpcRendererEvent, ...args: unknown[]) => unknown) => {
        listeners.set(channel, cb)
        return (): boolean => listeners.delete(channel)
      }
    }
  } as unknown as typeof window.electron
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({ showCode: false, isOutputVisible: false })
  useTestsListStore.setState({ rows: null })
  useRunOutputStore.setState({ runOutput: '' })
  useRunStore.setState({ run: null, origin: null, isActive: false })
})

describe('TestsWorkspace suite runs', () => {
  const run: RunView = {
    runId: 'r1',
    projectPath: '',
    scope: { kind: 'files', files: ['spec/search_products_spec.rb'] },
    framework: 'rspec',
    workers: 1,
    liveEvents: true,
    startedAt: new Date().toISOString(),
    phase: 'running',
    tests: {},
    order: [],
    output: [],
    finished: null
  }
  const renderAt = (path: string): void => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/overview/tests/:testKey" element={<TestsWorkspace />} />
          <Route path="/overview/tests" element={<TestsWorkspace />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('shows the run panel on the Tests list for a suite run', async () => {
    useRunStore.setState({
      run,
      origin: { route: '/overview/tests', label: 'Smoke' },
      isActive: true
    })
    renderAt('/overview/tests')
    expect(await screen.findByTestId('run-panel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-run failed' })).not.toBeInTheDocument()
  })

  it("doesn't show the suite's run panel on a test page", async () => {
    useRunStore.setState({
      run,
      origin: { route: '/overview/tests', label: 'Smoke' },
      isActive: true
    })
    renderAt(`/overview/tests/${keyOf(search)}`)
    await screen.findByDisplayValue(search.name)
    expect(screen.queryByTestId('run-panel')).not.toBeInTheDocument()
  })
})

describe('TestsWorkspace recording mode', () => {
  it('folds the list into a rail and shows the recording layout', async () => {
    await recording()
    await emit('new-recorded-step', step('n'))

    expect(screen.queryByRole('button', { name: /Search products/ })).not.toBeInTheDocument()
    const rail = screen.getByTestId('tests-rail')
    expect(rail).toHaveTextContent('Tests')
    expect(screen.getByText('Recording')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop & save' })).toBeInTheDocument()
    expect(document.querySelector('.w-\\[40\\%\\]')).toBeInTheDocument()
    expect(document.querySelector('.w-\\[60\\%\\]')).toBeInTheDocument()

    const latest = document.querySelectorAll('[data-latest="true"]')
    expect(latest).toHaveLength(1)
    expect(latest[0]).toHaveTextContent('https://x.test/n')
  })

  it('Stop & save saves once, says where, and brings the list back on the test', async () => {
    await recording()
    await emit('new-recorded-step', step('n'))
    api.saveRecording.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }))

    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(
        'Saved to your project as Search products (spec/search_products_spec.rb)'
      )
    )
    expect(api.saveRecording).toHaveBeenCalledTimes(1)
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', steps: [expect.anything(), step('n')] })
    )
    expect(screen.queryByTestId('tests-rail')).not.toBeInTheDocument()
    const row = await screen.findByRole('button', { name: /Search products/ })
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('the rail leaves the recording, saving it on the way', async () => {
    await recording()
    await emit('new-recorded-step', step('n'))
    const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }
    await emit('new-trace-step', traceStep)
    api.saveRecording.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /Tests/ }))

    await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
    expect(api.saveTrace).toHaveBeenCalledTimes(1)
    expect(api.saveTrace).toHaveBeenCalledWith('t1', [traceStep])
    expect(api.stopRecordingMain).toHaveBeenCalled()
    expect(api.saveRecording).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ id: 't1', steps: [expect.anything(), step('n')] })
    )
    expect(await screen.findByText(en.tests.selectOrCreate)).toBeInTheDocument()
    expect(screen.queryByTestId('tests-rail')).not.toBeInTheDocument()
  })

  it('autosave waits while recording; the save happens on stop', async () => {
    await recording()
    api.saveRecording.mockClear()
    vi.useFakeTimers()
    try {
      await emit('new-recorded-step', step('n'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(api.saveRecording).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
