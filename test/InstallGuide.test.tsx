import { render, screen, act } from '@testing-library/react'
import InstallGuide from '@pages/Info/InstallGuide'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

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
          <InstallGuide rubyMissing={true} />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('installGuide.rubyMissing')).toBeInTheDocument()
  })

  it('renders with a custom error message', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} rubyError="Custom error" />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('Custom error')).toBeInTheDocument()
  })

  it('renders the buttons', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} />
        </MemoryRouter>
      )
    })
    expect(screen.getByText('installGuide.githubButton')).toBeInTheDocument()
    expect(screen.getByText('installGuide.websiteButton')).toBeInTheDocument()
  })

  it('Go to GitHub opens docs.gem and Go to website opens docs.site, not window.open', async () => {
    const openDocs = vi.fn().mockResolvedValue({ success: true })
    // @ts-expect-error - Mocking window.api
    window.api = { openDocs }
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await act(async () => {
      render(
        <MemoryRouter>
          <InstallGuide rubyMissing={false} />
        </MemoryRouter>
      )
    })
    fireEvent.click(screen.getByText('installGuide.githubButton'))
    expect(openDocs).toHaveBeenLastCalledWith('docs.gem')
    fireEvent.click(screen.getByText('installGuide.websiteButton'))
    expect(openDocs).toHaveBeenLastCalledWith('docs.site')
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
