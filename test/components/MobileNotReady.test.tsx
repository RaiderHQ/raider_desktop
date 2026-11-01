import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import MobileNotReady from '@components/MobileNotReady'
import RunPanel from '@components/RunPanel'
import { useRunStore } from '@foundation/Stores/runStore'
import useProjectStore from '@foundation/Stores/projectStore'
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
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))

const scope = { kind: 'all' } as const
const origin = { route: '/overview/tests/x', label: 'Login works' }
const notReady = (reason: 'appium' | 'app', detail: string) => ({
  reason,
  detail,
  scope,
  origin,
  projectPath: '/proj'
})

const LocationProbe = (): JSX.Element => <div data-testid="location">{useLocation().pathname}</div>

const renderAt = (path: string, ui: JSX.Element): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  )
}

const start = vi.fn()

beforeEach(async () => {
  start.mockReset()
  ;(window as unknown as { api: object }).api = {
    setActiveProject: vi.fn().mockResolvedValue({ success: true }),
    readDirectory: vi.fn().mockResolvedValue([])
  }
  useProjectStore.setState({ projectPath: '/proj' })
  await act(async () => {})
  useRunStore.setState({
    run: null,
    origin: null,
    isActive: false,
    notReady: null,
    deviceFocusRequested: false,
    checking: false,
    start
  })
})

describe('MobileNotReady', () => {
  it('says Appium is unreachable, with Try again and Run anyway', () => {
    const value = notReady('appium', '127.0.0.1:4723')
    renderAt('/overview/tests/x', <MobileNotReady notReady={value} />)

    expect(
      screen.getByText(
        "Can't reach Appium at 127.0.0.1:4723. Start Appium (run `appium` in a terminal), then try again."
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open device settings' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(start).toHaveBeenLastCalledWith(scope, origin)
    fireEvent.click(screen.getByRole('button', { name: 'Run anyway' }))
    expect(start).toHaveBeenLastCalledWith(scope, origin, { skipMobileCheck: true })
  })

  it('says the app file is missing, with Try again and Open device settings', () => {
    renderAt('/overview', <MobileNotReady notReady={notReady('app', '/apps/Shop.app')} />)

    expect(
      screen.getByText("Can't find the app file /apps/Shop.app. Choose it in Device settings.")
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run anyway' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(start).toHaveBeenLastCalledWith(scope, origin)
  })

  it('asks for an app file when none is chosen yet', () => {
    renderAt('/overview', <MobileNotReady notReady={notReady('app', '')} />)

    expect(screen.getByText('Choose the app file to test before running.')).toBeInTheDocument()
    expect(screen.queryByText(/Can't find the app file/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run anyway' })).not.toBeInTheDocument()
  })

  it('can be dismissed', () => {
    useRunStore.setState({ notReady: notReady('appium', '127.0.0.1:4723') })
    renderAt('/overview', <MobileNotReady notReady={notReady('appium', '127.0.0.1:4723')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useRunStore.getState().notReady).toBeNull()
  })

  it('Try again is off while a check is running', () => {
    useRunStore.setState({ checking: true })
    renderAt('/overview', <MobileNotReady notReady={notReady('app', '/a.app')} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  })

  it('Open device settings asks for focus and goes to the project page', () => {
    renderAt('/overview/tests/x', <MobileNotReady notReady={notReady('app', '')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open device settings' }))
    expect(useRunStore.getState().deviceFocusRequested).toBe(true)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/overview$/)
  })
})

describe('RunPanel with a not-ready run', () => {
  it('shows it where the run was started from', () => {
    useRunStore.setState({ notReady: notReady('appium', '127.0.0.1:4723') })
    renderAt('/overview/tests/x', <RunPanel routeKey="/overview/tests/x" />)
    expect(screen.getByRole('button', { name: 'Run anyway' })).toBeInTheDocument()
  })

  it('shows nothing on another page', () => {
    useRunStore.setState({ notReady: notReady('appium', '127.0.0.1:4723') })
    renderAt('/overview', <RunPanel routeKey="/overview" />)
    expect(screen.queryByRole('button', { name: 'Run anyway' })).not.toBeInTheDocument()
  })

  it('clears when the project switches', async () => {
    useRunStore.setState({
      notReady: notReady('appium', '127.0.0.1:4723'),
      deviceFocusRequested: true
    })
    await act(async () => {
      useProjectStore.setState({ projectPath: '/other' })
    })
    expect(useRunStore.getState().notReady).toBeNull()
    expect(useRunStore.getState().deviceFocusRequested).toBe(false)
  })
})
