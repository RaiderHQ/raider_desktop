import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useState } from 'react'
import SuiteFilter from '@components/SuiteFilter'
import TestsList from '@components/TestsList'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import type { TestRow } from '@foundation/testKey'
import en from '@assets/translations/en.json'

const translate = (key: string, options: Record<string, string | number> = {}): string => {
  const plural =
    typeof options.count === 'number' ? `${key}_${options.count === 1 ? 'one' : 'other'}` : key
  const value = plural
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
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

const api = {
  createSuite: vi.fn(),
  deleteSuite: vi.fn(),
  runSuite: vi.fn(),
  prepareSuiteRun: vi.fn(),
  startRun: vi.fn(),
  // Main answers ok for a web project; the layout here is often not loaded yet
  checkMobileReady: vi.fn().mockResolvedValue({ ok: true }),
  getRunDefaults: vi.fn(),
  importTest: vi.fn(),
  importSuite: vi.fn(),
  importProject: vi.fn(),
  exportSuite: vi.fn(),
  exportProject: vi.fn(),
  getSuites: vi.fn(),
  listProjectTests: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([])
}

const suites = [
  { id: 's1', name: 'Smoke', tests: [] },
  { id: 's2', name: 'Checkout', tests: [] },
  { id: UNLISTED_SUITE_ID, name: 'Not in a suite', tests: [] }
]

const row = (name: string, suiteIds: string[]): TestRow => ({
  name,
  testId: name,
  ownership: 'recorded',
  file: `${name}.rb`,
  suiteIds
})
const rows = [row('Login', ['s1']), row('Pay', ['s2']), row('Both', ['s1', 's2'])]

const Harness = ({ initial = null }: { initial?: string | null }): JSX.Element => {
  const [value, setValue] = useState<string | null>(initial)
  const shown = value ? rows.filter((r) => r.suiteIds.includes(value)) : rows
  return (
    <TestsList
      rows={shown}
      selectedKey={null}
      onSelect={vi.fn()}
      onNewTest={vi.fn()}
      headerExtra={<SuiteFilter value={value} onChange={setValue} />}
    />
  )
}

/** A project is open; opening one resets the recorder, so the suites are put back */
const openProject = (): void => {
  useProjectStore.setState({ projectPath: '/p' })
  useRecorderStore.setState({ suites })
}

const openMenu = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Suite actions' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { api })
  api.getSuites.mockResolvedValue(suites)
  api.listProjectTests.mockResolvedValue([])
  api.createSuite.mockResolvedValue({ success: true, suite: { id: 's3', name: 'New', tests: [] } })
  api.deleteSuite.mockResolvedValue({ success: true })
  api.runSuite.mockResolvedValue({ success: true, output: 'ok' })
  api.prepareSuiteRun.mockResolvedValue({ mode: 'legacy' })
  api.startRun.mockResolvedValue({ runId: 'r1' })
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 8 })
  useRunStore.setState({ run: null, origin: null, isActive: false })
  useProjectStore.setState({ projectPath: null, layout: null })
  api.importTest.mockResolvedValue({ success: true })
  api.importSuite.mockResolvedValue({ success: true })
  api.importProject.mockResolvedValue({ success: true })
  api.exportSuite.mockResolvedValue({ success: true, path: '/out/s1.zip' })
  api.exportProject.mockResolvedValue({ success: true, path: '/out/p.zip' })
  useRecorderStore.setState({ suites, isRunning: false })
  useRubyStore.setState({ rubyCommand: 'ruby' })
  useRunOutputStore.setState({ runOutput: '', runFailed: false })
  useTestsListStore.setState({ rows: [] })
})

describe('SuiteFilter', () => {
  it('cannot run a suite in a mobile project, and says so', async () => {
    useProjectStore.setState({ projectPath: '/p' })
    await act(async () => {})
    useProjectStore.setState({
      layout: {
        framework: 'rspec',
        automation: 'appium',
        mobilePlatform: 'ios',
        specPath: 'spec',
        featurePath: 'features',
        helperPath: 'helpers',
        recordable: false,
        unsupportedReason: 'mobile'
      }
    })
    useRecorderStore.setState({ suites })
    render(<Harness initial="s1" />)
    openMenu()
    const run = screen.getByRole('menuitem', { name: 'Run suite' })
    expect(run).toBeDisabled()
    expect(screen.getByText("Suites aren't available for mobile projects yet.")).toBeInTheDocument()
    fireEvent.click(run)
    expect(api.runSuite).not.toHaveBeenCalled()
    expect(api.prepareSuiteRun).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it('lists All tests plus each suite and filters the rows by suite', () => {
    render(<Harness />)
    const select = screen.getByLabelText('Suite')
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['All tests', 'Smoke', 'Checkout', 'Not in a suite'])
    expect(screen.getAllByText(/Login|Pay|Both/)).toHaveLength(3)

    fireEvent.change(select, { target: { value: 's1' } })
    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
    expect(screen.queryByText('Pay')).not.toBeInTheDocument()

    fireEvent.change(select, { target: { value: '' } })
    expect(screen.getByText('Pay')).toBeInTheDocument()
  })

  it('offers the suite actions, with Run suite disabled for All tests', () => {
    render(<Harness />)
    openMenu()
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent)
    expect(names).toEqual([
      'Run suite',
      'New suite',
      'Import test',
      'Import suite',
      'Import project',
      'Export suite',
      'Export project'
    ])
    expect(screen.getByRole('menuitem', { name: 'Run suite' })).toBeDisabled()
  })

  it('offers Delete suite for a real suite but not for the unlisted one', () => {
    const { unmount } = render(<Harness initial="s1" />)
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Delete suite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Run suite' })).toBeEnabled()
    unmount()
    render(<Harness initial={UNLISTED_SUITE_ID} />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Delete suite' })).not.toBeInTheDocument()
  })

  it('runs the chosen suite and shows its output', async () => {
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() => expect(api.runSuite).toHaveBeenCalledWith('s1', '', 'ruby'))
    expect(api.prepareSuiteRun).toHaveBeenCalledWith('s1')
    expect(api.prepareSuiteRun.mock.invocationCallOrder[0]).toBeLessThan(
      api.runSuite.mock.invocationCallOrder[0]
    )
    await waitFor(() => expect(useRunOutputStore.getState().runOutput).toBe('ok'))
    expect(useRecorderStore.getState().isRunning).toBe(false)
  })

  it('runs a suite in files mode live, shown in Overview\'s panel', async () => {
    openProject()
    api.prepareSuiteRun.mockResolvedValue({
      mode: 'files',
      files: ['spec/a_spec.rb', 'spec/b_spec.rb'],
      skipped: []
    })
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1))
    expect(api.prepareSuiteRun).toHaveBeenCalledWith('s1')
    expect(api.startRun.mock.calls[0][0].scope).toEqual({
      kind: 'files',
      files: ['spec/a_spec.rb', 'spec/b_spec.rb']
    })
    await waitFor(() =>
      expect(useRunStore.getState().origin).toEqual({ route: '/overview', label: 'Smoke' })
    )
    expect(api.runSuite).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('says how many tests a files-mode suite run skipped', async () => {
    openProject()
    api.prepareSuiteRun.mockResolvedValue({
      mode: 'files',
      files: ['spec/a_spec.rb'],
      skipped: ['spec/gone_spec.rb']
    })
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('1 test was skipped: its file is missing', {
        icon: '⚠️'
      })
    )
  })

  it('toasts why a suite could not be prepared', async () => {
    api.prepareSuiteRun.mockResolvedValue({ error: 'no suite' })
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('no suite'))
    expect(api.startRun).not.toHaveBeenCalled()
    expect(api.runSuite).not.toHaveBeenCalled()
  })

  it('disables Run suite while a live run is going', () => {
    useRunStore.setState({ isActive: true })
    render(<Harness initial="s1" />)
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Run suite' })).toBeDisabled()
  })

  it('toasts the outcome of a run and shows the output', async () => {
    useRecorderStore.setState({ isOutputVisible: false })
    const { unmount } = render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Smoke passed'))
    expect(useRecorderStore.getState().isOutputVisible).toBe(true)
    unmount()
    api.runSuite.mockResolvedValue({ success: false, output: 'boom' })
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        "Smoke failed \u2014 open a test's Last run for details"
      )
    )
  })

  it('says so when Ruby is missing instead of doing nothing', () => {
    useRubyStore.setState({ rubyCommand: null })
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run suite' }))
    expect(mockToast.error).toHaveBeenCalledWith(en.recorder.noRuby)
    expect(api.runSuite).not.toHaveBeenCalled()
  })

  it('creates a suite, reloads the list and selects the new suite', async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    useTestsListStore.setState({ reload })
    render(<Harness />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New suite' }))
    fireEvent.change(screen.getByLabelText('New suite'), { target: { value: 'New' } })
    fireEvent.keyDown(screen.getByLabelText('New suite'), { key: 'Enter' })
    await waitFor(() => expect(api.createSuite).toHaveBeenCalledWith('New'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('deletes the suite after confirming, and goes back to All tests', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete suite' }))
    await waitFor(() => expect(api.deleteSuite).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(screen.getByLabelText('Suite')).toHaveValue(''))
  })

  it('does not delete when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete suite' }))
    expect(api.deleteSuite).not.toHaveBeenCalled()
  })

  it('imports a test into the filtered suite (or outside any suite) and reloads', async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    useTestsListStore.setState({ reload })
    const { unmount } = render(<Harness initial="s2" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import test' }))
    await waitFor(() => expect(api.importTest).toHaveBeenCalledWith('s2'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(mockToast.success).toHaveBeenCalledWith('Test imported successfully!')
    unmount()
    render(<Harness />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import test' }))
    await waitFor(() => expect(api.importTest).toHaveBeenLastCalledWith(UNLISTED_SUITE_ID))
  })

  it('imports a suite and a project, and reports a failure', async () => {
    api.importProject.mockResolvedValue({ success: false, error: 'bad zip' })
    render(<Harness />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import suite' }))
    await waitFor(() => expect(api.importSuite).toHaveBeenCalled())
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import project' }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Import failed: bad zip'))
  })

  it('exports the suite and the project', async () => {
    render(<Harness initial="s1" />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export suite' }))
    await waitFor(() => expect(api.exportSuite).toHaveBeenCalledWith('s1'))
    expect(mockToast.success).toHaveBeenCalledWith('Suite exported to /out/s1.zip')
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export project' }))
    await waitFor(() => expect(api.exportProject).toHaveBeenCalled())
  })
})
