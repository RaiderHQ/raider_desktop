import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useState } from 'react'
import SuiteFilter from '@components/SuiteFilter'
import TestsList from '@components/TestsList'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import type { TestRow } from '@foundation/testKey'
import en from '@assets/translations/en.json'

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

const api = {
  createSuite: vi.fn(),
  deleteSuite: vi.fn(),
  runSuite: vi.fn(),
  importTest: vi.fn(),
  importSuite: vi.fn(),
  importProject: vi.fn(),
  exportSuite: vi.fn(),
  exportProject: vi.fn(),
  getSuites: vi.fn(),
  listProjectTests: vi.fn()
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
    await waitFor(() => expect(useRunOutputStore.getState().runOutput).toBe('ok'))
    expect(useRecorderStore.getState().isRunning).toBe(false)
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
