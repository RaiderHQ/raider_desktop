import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import MainTemplate from '@templates/Main'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, opts?: object) => string } => ({
    t: (key: string, opts?: object): string => (opts ? `${key} ${JSON.stringify(opts)}` : key)
  })
}))

vi.mock('@foundation/Stores/versionStore', () => ({
  __esModule: true,
  default: vi.fn(() => '2.0.0')
}))

vi.mock('@foundation/Stores/projectStore', () => {
  const useProjectStore = (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector({ projectPath: '/fake/project' }) : { projectPath: '/fake/project' }
  useProjectStore.getState = () => ({ projectPath: '/fake/project' })
  useProjectStore.subscribe = vi.fn()
  return { default: useProjectStore }
})

vi.mock('@foundation/Stores/rubyStore', () => {
  const state = {
    rubyCommand: null,
    rubyVersion: null,
    versionWarning: null,
    setRubyCommand: vi.fn(),
    setRubyVersion: vi.fn(),
    setVersionWarning: vi.fn()
  }
  const useRubyStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state
  useRubyStore.getState = () => state
  return { default: useRubyStore }
})

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }),
  Toaster: (): JSX.Element => <div data-testid="toaster" />
}))

// Mock window.api to prevent useEffect errors
beforeAll(() => {
  ;(window as unknown as Record<string, unknown>).api = {
    isRubyInstalled: vi
      .fn()
      .mockResolvedValue({ success: true, rubyCommand: 'ruby', rubyVersion: '3.2.0' }),
    closeApp: vi.fn(),
    onTestsMigrated: vi.fn(),
    removeTestsMigratedListener: vi.fn(),
    onSuitesTooNew: vi.fn(),
    removeSuitesTooNewListener: vi.fn()
  }
  ;(window as unknown as Record<string, unknown>).electron = {
    ipcRenderer: { on: vi.fn().mockReturnValue(() => {}) }
  }
})

describe('MainTemplate Navigation', () => {
  it('has no Recorder navigation link', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.queryByText('Recorder')).not.toBeInTheDocument()
  })

  it('links "Ruby Raider" to the overview whenever a project is open', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText('Ruby Raider').closest('a')).toHaveAttribute('href', '/overview')
  })

  it('displays the version in the footer', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText(/version/)).toBeInTheDocument()
  })
})

describe('MainTemplate suites recovered toast', () => {
  const recoveredListener = (): ((event: unknown, info?: { backupSaved?: boolean }) => void) => {
    const on = (
      window as unknown as { electron: { ipcRenderer: { on: ReturnType<typeof vi.fn> } } }
    ).electron.ipcRenderer.on
    const call = on.mock.calls.find(([channel]) => channel === 'suites-recovered')
    return call![1]
  }

  it('says a copy was kept when the backup was saved', async () => {
    const toast = (await import('react-hot-toast')).default as unknown as {
      error: ReturnType<typeof vi.fn>
    }
    toast.error.mockClear()
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    recoveredListener()({}, { backupSaved: true })
    expect(toast.error).toHaveBeenCalledWith('suites.recovered.backupSaved', expect.anything())
  })

  it('says no copy could be kept when the backup failed', async () => {
    const toast = (await import('react-hot-toast')).default as unknown as {
      error: ReturnType<typeof vi.fn>
    }
    toast.error.mockClear()
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    recoveredListener()({}, { backupSaved: false })
    expect(toast.error).toHaveBeenCalledWith('suites.recovered.backupFailed', expect.anything())
  })
})

describe('MainTemplate project files toasts', () => {
  type Api = Record<string, ReturnType<typeof vi.fn>>
  const api = (): Api => (window as unknown as { api: Api }).api
  const listener = (name: string): ((...args: unknown[]) => void) =>
    api()[name].mock.calls.at(-1)![0]
  const toastMock = async (): Promise<
    ReturnType<typeof vi.fn> & {
      success: ReturnType<typeof vi.fn>
      error: ReturnType<typeof vi.fn>
    }
  > => (await import('react-hot-toast')).default as never

  const renderMain = (): void => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
  }

  it('says the recorded tests are now project files', async () => {
    const toast = await toastMock()
    toast.success.mockClear()
    renderMain()
    listener('onTestsMigrated')({}, { migrated: 2, postponed: false })
    expect(toast.success).toHaveBeenCalledWith(
      'suites.migrated.done {"count":2}',
      expect.anything()
    )
  })

  it('says a postponed move keeps the tests safe', async () => {
    const toast = await toastMock()
    toast.mockClear()
    renderMain()
    listener('onTestsMigrated')({}, { migrated: 0, postponed: true })
    expect(toast).toHaveBeenCalledWith('suites.migrated.postponed', expect.anything())
  })

  it('says suites from a newer Raider are left alone', async () => {
    const toast = await toastMock()
    toast.error.mockClear()
    renderMain()
    listener('onSuitesTooNew')({})
    expect(toast.error).toHaveBeenCalledWith('suites.tooNew', expect.anything())
  })
})
