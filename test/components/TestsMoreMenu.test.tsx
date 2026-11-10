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
  useRunStore.setState({ run: null, origin: null, isActive: false })
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

  it('disables both imports, with the reason, in a project that cannot record', () => {
    useProjectStore.setState({
      layout: { recordable: false, unsupportedReason: 'minitest' } as never
    })
    render(<TestsMoreMenu tag={null} />)
    open()
    for (const name of ['Import test', 'Import project']) {
      const item = screen.getByRole('menuitem', { name })
      expect(item).toBeDisabled()
      expect(item).toHaveAttribute(
        'title',
        "This project uses a test style Raider can't record into yet."
      )
    }
    // Exporting what the project has stays possible
    expect(screen.getByRole('menuitem', { name: 'Export project' })).toBeEnabled()
  })

  it('falls back to the generic reason', () => {
    useProjectStore.setState({ layout: { recordable: false } as never })
    render(<TestsMoreMenu tag={null} />)
    open()
    expect(screen.getByRole('menuitem', { name: 'Import test' })).toHaveAttribute(
      'title',
      "Raider can't record into this project yet."
    )
  })

  it('says what an import of a project did', async () => {
    api.importProject.mockResolvedValue({ success: true, imported: 2, skipped: 1, failed: 0 })
    render(<TestsMoreMenu tag={null} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import project' }))
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(
        'Imported 2, skipped 1 already in the project, 0 failed.'
      )
    )
  })

  it('reports a partly failed import as an error', async () => {
    api.importProject.mockResolvedValue({
      success: false,
      error: '1 test could not be imported.',
      imported: 1,
      skipped: 0,
      failed: 1
    })
    render(<TestsMoreMenu tag={null} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import project' }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
  })
})

describe('TestsMoreMenu: New flow', () => {
  const withFlowsReady = (ready: boolean): void => {
    Object.assign(window, { api: { ...api, flowsReady: vi.fn().mockResolvedValue(ready) } })
  }

  it('has no New flow item without a handler', () => {
    render(<TestsMoreMenu tag={null} />)
    open()
    expect(screen.queryByRole('menuitem', { name: 'New flow…' })).not.toBeInTheDocument()
  })

  it('is disabled with the set-up tooltip until main says flows are set up', async () => {
    withFlowsReady(false)
    const onNewFlow = vi.fn()
    render(<TestsMoreMenu tag={null} onNewFlow={onNewFlow} />)
    open()
    const item = screen.getByRole('menuitem', { name: 'New flow…' })
    await waitFor(() => expect(window.api.flowsReady).toHaveBeenCalled())
    expect(item).toBeDisabled()
    expect(item).toHaveAttribute('title', en.tooltips.tests.flowsNotReady)
    expect(en.tooltips.tests.flowsNotReady).toBe(
      'Set up flows first: run raider flow init in this project'
    )
    fireEvent.click(item)
    expect(onNewFlow).not.toHaveBeenCalled()
  })

  it('starts a new flow once flows are set up', async () => {
    withFlowsReady(true)
    const onNewFlow = vi.fn()
    render(<TestsMoreMenu tag={null} onNewFlow={onNewFlow} />)
    open()
    const item = screen.getByRole('menuitem', { name: 'New flow…' })
    await waitFor(() => expect(item).toBeEnabled())
    expect(item).toHaveAttribute('title', en.tooltips.tests.newFlow)
    fireEvent.click(item)
    expect(onNewFlow).toHaveBeenCalledTimes(1)
  })
})
