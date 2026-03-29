import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
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
  default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
  Toaster: (): JSX.Element => <div data-testid="toaster" />
}))

// Mock window.api to prevent useEffect errors
beforeAll(() => {
  ;(window as unknown as Record<string, unknown>).api = {
    isRubyInstalled: vi.fn().mockResolvedValue({ success: true, rubyCommand: 'ruby', rubyVersion: '3.2.0' }),
    closeApp: vi.fn()
  }
})

describe('MainTemplate Navigation', () => {
  it('renders the Recorder navigation link', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText('Recorder')).toBeInTheDocument()
  })

  it('does not highlight Recorder link when on /overview', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    const recorderLink = screen.getByText('Recorder')
    expect(recorderLink.className).not.toContain('font-semibold')
  })

  it('highlights Recorder link when on /recorder', () => {
    render(
      <MemoryRouter initialEntries={['/recorder']}>
        <MainTemplate />
      </MemoryRouter>
    )

    const recorderLink = screen.getByText('Recorder')
    expect(recorderLink.className).toContain('font-semibold')
    expect(recorderLink.className).toContain('bg-ruby-sub')
  })

  it('does not highlight Recorder link when on root /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MainTemplate />
      </MemoryRouter>
    )

    const recorderLink = screen.getByText('Recorder')
    expect(recorderLink.className).not.toContain('font-semibold')
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
