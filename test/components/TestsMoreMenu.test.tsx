import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import TestsMoreMenu from '@components/TestsMoreMenu'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import en from '@assets/translations/en.json'

const translate = (key: string, options: Record<string, string | number> = {}): string => {
  const value = key
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
  importTest: vi.fn(),
  importProject: vi.fn(),
  exportProject: vi.fn(),
  listProjectTests: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([])
}

const open = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'More test actions' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { api })
  api.listProjectTests.mockResolvedValue([])
  api.importTest.mockResolvedValue({ success: true })
  api.importProject.mockResolvedValue({ success: true })
  api.exportProject.mockResolvedValue({ success: true, path: '/out/p.zip' })
  useRunStore.setState({ run: null, origin: null, isActive: false, checking: false })
  useProjectStore.setState({ projectPath: '/p', layout: null })
  useRecorderStore.setState({ isRunning: false })
  useTestsListStore.setState({ rows: [] })
})

describe('TestsMoreMenu', () => {
  it('shows a labelled button that opens a menu', () => {
    render(<TestsMoreMenu tag={null} />)
    const button = screen.getByRole('button', { name: 'More test actions' })
    expect(button).toHaveTextContent('More')
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    open()
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Run tagged tests',
      'Import test',
      'Import project',
      'Export project'
    ])
  })

  it('disables Run tagged tests on All tests and says why', () => {
    render(<TestsMoreMenu tag={null} />)
    open()
    const item = screen.getByRole('menuitem', { name: 'Run tagged tests' })
    expect(item).toBeDisabled()
    expect(item).toHaveAttribute('title', 'Pick a tag first')
  })

  it('starts a run of the chosen tag from the Overview panel', () => {
    const start = vi.fn()
    useRunStore.setState({ start } as never)
    render(<TestsMoreMenu tag="smoke" />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run tagged tests' }))
    expect(start).toHaveBeenCalledWith(
      { kind: 'tags', tags: ['smoke'] },
      { route: '/overview', label: 'Tests tagged smoke' }
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('disables Run tagged tests while a run is active', () => {
    useRunStore.setState({ isActive: true })
    render(<TestsMoreMenu tag="smoke" />)
    open()
    expect(screen.getByRole('menuitem', { name: 'Run tagged tests' })).toBeDisabled()
  })

  it('imports a test and reloads the list', async () => {
    render(<TestsMoreMenu tag={null} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import test' }))
    await waitFor(() => expect(api.listProjectTests).toHaveBeenCalled())
    expect(api.importTest).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
  })

  it('imports and exports a project', async () => {
    render(<TestsMoreMenu tag={null} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import project' }))
    await waitFor(() => expect(api.importProject).toHaveBeenCalled())
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export project' }))
    await waitFor(() => expect(api.exportProject).toHaveBeenCalled())
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(2))
  })

  it('reports a failed export', async () => {
    api.exportProject.mockResolvedValue({ success: false, error: 'nope' })
    render(<TestsMoreMenu tag={null} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export project' }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
  })

  it('leaves the mobile check of a tagged run to the live runner', () => {
    // runStore.start asks main whether the device is ready and shows what is missing
    useProjectStore.setState({ layout: { automation: 'appium' } as never })
    render(<TestsMoreMenu tag="smoke" />)
    open()
    expect(screen.getByRole('menuitem', { name: 'Run tagged tests' })).toBeEnabled()
  })

  it('disables Import test in a mobile project', () => {
    useProjectStore.setState({ layout: { automation: 'appium' } as never })
    render(<TestsMoreMenu tag={null} />)
    open()
    expect(screen.getByRole('menuitem', { name: 'Import test' })).toBeDisabled()
  })
})
