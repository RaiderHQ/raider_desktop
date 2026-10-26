import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import ProjectTestsPanel from '@components/ProjectTestsPanel'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { ProjectTestEntry } from '@shared/types/projectTest'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: (): typeof mockNavigate => mockNavigate
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast, Toaster: (): null => null }))

const entries: ProjectTestEntry[] = [
  { file: 'spec/login_spec.rb', name: 'Login works', ownership: 'recorded', testId: 't1' },
  {
    file: 'spec/cart_spec.rb',
    name: 'Cart totals',
    ownership: 'codeOwnedWasRecorded',
    testId: 't2'
  },
  { file: 'spec/api_spec.rb', name: 'API health', ownership: 'code' }
]

const suites = [
  { id: 's1', name: 'Smoke', tests: [{ id: 't1', name: 'Login works', url: '', steps: [] }] }
]

const api = {
  listProjectTests: vi.fn(),
  getSuites: vi.fn(),
  openCodeTest: vi.fn(),
  saveRecording: vi.fn()
}

const renderPanel = async (): Promise<void> => {
  await act(async () => {
    render(<ProjectTestsPanel />)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listProjectTests.mockResolvedValue(entries)
  api.getSuites.mockResolvedValue(suites)
  api.saveRecording.mockResolvedValue({ success: true })
  // @ts-expect-error - Mocking window.api
  window.api = api
  useRecorderStore.setState({
    suites: [],
    activeSuiteId: null,
    activeTest: null,
    readOnlyView: null
  })
})

describe('ProjectTestsPanel', () => {
  it('lists three ownerships with badges', async () => {
    await renderPanel()
    expect(screen.getByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('Cart totals')).toBeInTheDocument()
    expect(screen.getByText('API health')).toBeInTheDocument()
    expect(screen.getByText('tests.badge.recorded')).toBeInTheDocument()
    expect(screen.getByText('tests.badge.codeOwned')).toBeInTheDocument()
    expect(screen.getByText('tests.badge.code')).toBeInTheDocument()
    expect(screen.getAllByText('tests.edit')).toHaveLength(1)
    expect(screen.getAllByText('tests.view')).toHaveLength(2)
  })

  it('edit opens recorder with test', async () => {
    await renderPanel()
    await act(async () => {
      fireEvent.click(screen.getByText('tests.edit'))
    })
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/recorder'))
    const state = useRecorderStore.getState()
    expect(state.activeSuiteId).toBe('s1')
    expect(state.activeTest?.id).toBe('t1')
    expect(state.readOnlyView).toBeNull()
  })

  it('view opens read-only', async () => {
    api.openCodeTest.mockResolvedValue({
      file: 'spec/api_spec.rb',
      examples: [{ name: 'responds', steps: [] }]
    })
    await renderPanel()
    await act(async () => {
      fireEvent.click(screen.getAllByText('tests.view')[1])
    })
    expect(api.openCodeTest).toHaveBeenCalledWith('spec/api_spec.rb')
    expect(useRecorderStore.getState().readOnlyView?.file).toBe('spec/api_spec.rb')
    expect(mockNavigate).toHaveBeenCalledWith('/recorder')
  })

  it('restore re-saves a missing file from its suite', async () => {
    api.listProjectTests.mockResolvedValue([
      {
        file: 'spec/login_spec.rb',
        name: 'Login works',
        ownership: 'recorded',
        testId: 't1',
        missingFile: true
      }
    ])
    await renderPanel()
    expect(screen.getByText('tests.fileMissing')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('tests.restore'))
    })
    expect(api.saveRecording).toHaveBeenCalledWith('s1', suites[0].tests[0])
  })

  it('shows the empty state', async () => {
    api.listProjectTests.mockResolvedValue([])
    await renderPanel()
    expect(screen.getByText('tests.empty')).toBeInTheDocument()
  })

  it('no raw paths in default view', async () => {
    await renderPanel()
    expect(document.body.textContent).not.toMatch(/spec\/|_spec\.rb/)
  })
})
