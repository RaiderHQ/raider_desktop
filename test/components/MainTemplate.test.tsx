import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MainTemplate from '@templates/Main'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

vi.mock('@foundation/Stores/versionStore', () => ({
  __esModule: true,
  default: vi.fn(() => '2.0.0')
}))

vi.mock('react-hot-toast', () => ({
  Toaster: (): JSX.Element => <div data-testid="toaster" />
}))

describe('MainTemplate Navigation', () => {
  it('renders all navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText('menu.tests')).toBeInTheDocument()
    expect(screen.getByText('Recorder')).toBeInTheDocument()
    // Settings and Dashboard have been removed from the nav
    expect(screen.queryByText('menu.settings')).not.toBeInTheDocument()
    expect(screen.queryByText('menu.dashboard')).not.toBeInTheDocument()
  })

  it('highlights Tests link when on /overview', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    const testsLink = screen.getByText('menu.tests')
    expect(testsLink.className).toContain('font-semibold')
    expect(testsLink.className).toContain('bg-ruby-sub')

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

    expect(screen.getByText('version')).toBeInTheDocument()
  })
})
