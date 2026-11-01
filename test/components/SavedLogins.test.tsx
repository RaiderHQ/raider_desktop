import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import SavedLogins from '@components/SavedLogins'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunView } from '@foundation/run/runModel'
import type { SavedLogin, SavedLoginsResult } from '@shared/types/savedLogins'
import en from '../../src/renderer/src/assets/translations/en.json'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, vals?: Record<string, unknown>) => string } => ({
    t: (key: string, vals?: Record<string, unknown>): string =>
      vals && Object.keys(vals).length ? `${key} ${JSON.stringify(vals)}` : key
  })
}))

const toastError = vi.fn()
vi.mock('react-hot-toast', () => ({
  default: { error: (m: string): void => toastError(m), success: vi.fn() }
}))

const NOW = new Date('2026-11-01T12:00:00Z')

const login = (overrides: Partial<SavedLogin> = {}): SavedLogin => ({
  name: 'admin',
  origin: 'https://shop.example.com/login?x=1',
  savedAt: '2026-10-30T12:00:00Z',
  format: 1,
  known: true,
  expired: false,
  ...overrides
})

const modal = (): HTMLElement => document.getElementById('confirm-modal-overlay') as HTMLElement

const listSavedLogins = vi.fn()
const forgetSavedLogin = vi.fn()

const result = (logins: SavedLogin[], gemSupportsLogins = true): SavedLoginsResult => ({
  logins,
  gemSupportsLogins
})

const finishedRun = (finishedAt: string, projectPath = '/p'): RunView =>
  ({
    runId: 'r1',
    projectPath,
    finished: { finishedAt }
  }) as unknown as RunView

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  toastError.mockClear()
  listSavedLogins.mockReset()
  forgetSavedLogin.mockReset()
  ;(window as unknown as { api: unknown }).api = {
    listSavedLogins,
    forgetSavedLogin,
    setActiveProject: vi.fn().mockResolvedValue({})
  }
  useProjectStore.setState({ projectPath: '/p' })
  useRunStore.setState({ run: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SavedLogins', () => {
  it('renders the name, the host only and a relative age', async () => {
    listSavedLogins.mockResolvedValue(result([login()]))
    render(<SavedLogins />)
    const row = await screen.findByTestId('saved-login-row')
    expect(within(row).getByText('admin')).toBeInTheDocument()
    expect(within(row).getByText('shop.example.com')).toBeInTheDocument()
    expect(row.textContent).not.toContain('/login')
    expect(row.textContent).toContain('logins.saved {"age":"2 days ago"}')
    expect(screen.queryByTestId('saved-login-expired')).not.toBeInTheDocument()
  })

  it('picks minutes, then hours, then days', async () => {
    listSavedLogins.mockResolvedValue(
      result([
        login({ name: 'a', savedAt: '2026-11-01T11:30:00Z' }),
        login({ name: 'b', savedAt: '2026-11-01T09:00:00Z' }),
        login({ name: 'c', savedAt: '2026-10-31T12:00:00Z' })
      ])
    )
    render(<SavedLogins />)
    const rows = await screen.findAllByTestId('saved-login-row')
    expect(rows[0].textContent).toContain('30 minutes ago')
    expect(rows[1].textContent).toContain('3 hours ago')
    expect(rows[2].textContent).toContain('yesterday')
  })

  it('says saved just now under a minute, and for a time in the future', async () => {
    listSavedLogins.mockResolvedValue(
      result([
        login({ name: 'a', savedAt: '2026-11-01T11:59:30Z' }),
        login({ name: 'b', savedAt: '2026-11-01T12:05:00Z' })
      ])
    )
    render(<SavedLogins />)
    const rows = await screen.findAllByTestId('saved-login-row')
    for (const row of rows) {
      expect(row.textContent).toContain('logins.savedJustNow')
      expect(row.textContent).not.toContain('now"')
    }
    expect(en.logins.savedJustNow).toBe('Saved just now')
  })

  it('shows no age or site when they are null or unparseable', async () => {
    listSavedLogins.mockResolvedValue(
      result([
        login({ name: 'a', savedAt: null, origin: null }),
        login({ name: 'b', savedAt: 'not a date', origin: 'nope' })
      ])
    )
    render(<SavedLogins />)
    const rows = await screen.findAllByTestId('saved-login-row')
    for (const row of rows) {
      expect(row.textContent).not.toContain('logins.saved')
      expect(row.textContent).not.toContain('nope')
    }
  })

  it('shows the Expired badge with the title for each reason', async () => {
    listSavedLogins.mockResolvedValue(
      result([
        login({ name: 'old', expired: true, expiredReason: 'age' }),
        login({ name: 'other', expired: true, expiredReason: 'site' })
      ])
    )
    render(<SavedLogins />)
    const badges = await screen.findAllByTestId('saved-login-expired')
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveTextContent('logins.expired')
    expect(badges[0]).toHaveAttribute('title', 'logins.expiredAge')
    expect(badges[1]).toHaveAttribute('title', 'logins.expiredSite')
  })

  it('shows an unknown-format row with only Forget and never the Expired badge', async () => {
    listSavedLogins.mockResolvedValue(
      result([login({ name: 'weird', known: false, expired: true, expiredReason: 'age' })])
    )
    render(<SavedLogins />)
    const row = await screen.findByTestId('saved-login-row')
    expect(within(row).getByText('logins.unknownFormat')).toBeInTheDocument()
    expect(screen.queryByTestId('saved-login-expired')).not.toBeInTheDocument()
    expect(screen.getByTestId('saved-login-forget')).toBeInTheDocument()
    expect(row.textContent).not.toContain('logins.saved')
  })

  it('shows the empty state, plus the update hint when the gem is too old', async () => {
    listSavedLogins.mockResolvedValue(result([], true))
    const { unmount } = render(<SavedLogins />)
    expect(await screen.findByText('logins.empty')).toBeInTheDocument()
    expect(screen.queryByText('logins.updateGem')).not.toBeInTheDocument()
    unmount()

    listSavedLogins.mockResolvedValue(result([], false))
    render(<SavedLogins />)
    expect(await screen.findByText('logins.empty')).toBeInTheDocument()
    expect(screen.getByText('logins.updateGem')).toBeInTheDocument()
  })

  it('Forget asks first, then forgets and reloads on confirm', async () => {
    listSavedLogins.mockResolvedValue(result([login()]))
    forgetSavedLogin.mockResolvedValue({ ok: true })
    render(<SavedLogins />)
    fireEvent.click(await screen.findByTestId('saved-login-forget'))
    expect(forgetSavedLogin).not.toHaveBeenCalled()
    expect(screen.getByText(/logins\.forgetConfirm/)).toBeInTheDocument()

    listSavedLogins.mockResolvedValue(result([]))
    fireEvent.click(within(modal()).getByRole('button', { name: 'logins.forget' }))
    await waitFor(() => expect(forgetSavedLogin).toHaveBeenCalledWith('admin'))
    await waitFor(() => expect(listSavedLogins).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('logins.empty')).toBeInTheDocument()
    expect(screen.queryByText(/logins\.forgetConfirm/)).not.toBeInTheDocument()
  })

  it('cancel does nothing', async () => {
    listSavedLogins.mockResolvedValue(result([login()]))
    render(<SavedLogins />)
    fireEvent.click(await screen.findByTestId('saved-login-forget'))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(forgetSavedLogin).not.toHaveBeenCalled()
    expect(listSavedLogins).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/logins\.forgetConfirm/)).not.toBeInTheDocument()
  })

  it('toasts the message when forgetting fails', async () => {
    listSavedLogins.mockResolvedValue(result([login()]))
    forgetSavedLogin.mockResolvedValue({ error: 'Could not forget it' })
    render(<SavedLogins />)
    fireEvent.click(await screen.findByTestId('saved-login-forget'))
    fireEvent.click(within(modal()).getByRole('button', { name: 'logins.forget' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not forget it'))
  })

  it('reloads when a run of the open project finishes', async () => {
    listSavedLogins.mockResolvedValue(result([login()]))
    render(<SavedLogins />)
    await screen.findByTestId('saved-login-row')
    expect(listSavedLogins).toHaveBeenCalledTimes(1)

    act(() => useRunStore.setState({ run: finishedRun('2026-11-01T12:01:00Z', '/other') }))
    expect(listSavedLogins).toHaveBeenCalledTimes(1)

    act(() => useRunStore.setState({ run: finishedRun('2026-11-01T12:02:00Z') }))
    await waitFor(() => expect(listSavedLogins).toHaveBeenCalledTimes(2))
  })

  it('never mentions cookies or tokens', async () => {
    listSavedLogins.mockResolvedValue(
      result([login({ name: 'a', expired: true, expiredReason: 'age' }), login({ name: 'b' })])
    )
    const { container } = render(<SavedLogins />)
    await screen.findAllByTestId('saved-login-row')
    expect(container.textContent?.toLowerCase()).not.toMatch(/cookie|token/)
    for (const value of Object.values(en.logins)) {
      expect(String(value).toLowerCase()).not.toMatch(/cookie|token/)
    }
  })
})
