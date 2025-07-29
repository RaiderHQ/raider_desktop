import { render, screen, act } from '@testing-library/react'
import InstallGuide from '@pages/Info/InstallGuide'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

describe('InstallGuide Page', () => {
  it('renders with ruby missing message', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={true} allureMissing={false} />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('installGuide.rubyMissing')).toBeInTheDocument()
  })

  it('renders with allure missing message', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} allureMissing={true} />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('installGuide.allureMissing')).toBeInTheDocument()
  })

  it('renders with both messages', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={true} allureMissing={true} />
        </MemoryRouter>
      )
    })
    expect(
      screen.getByText('installGuide.rubyMissing installGuide.allureMissing')
    ).toBeInTheDocument()
  })

  it('renders with a custom error message', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} allureMissing={false} rubyError="Custom error" />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('Custom error')).toBeInTheDocument()
  })

  it('renders the buttons', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} allureMissing={false} />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('installGuide.githubButton')).toBeInTheDocument()
    expect(screen.getByText('installGuide.websiteButton')).toBeInTheDocument()
  })
})
