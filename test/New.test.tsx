import { render, screen, act } from '@testing-library/react'
import CreateProject from '@pages/New'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

vi.mock('@foundation/Stores/loadingStore', () => ({
  __esModule: true,
  default: (
    selector: (state: { loading: boolean; setLoading: () => void }) => unknown
  ): unknown => {
    const state = {
      loading: false,
      setLoading: vi.fn()
    }
    return selector(state)
  }
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: (selector: (state: { setProjectPath: () => void }) => unknown): unknown => {
    const state = {
      setProjectPath: vi.fn()
    }
    return selector(state)
  }
}))

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn()
  }))
}))

describe('CreateProject Page', (): void => {
  it('renders correctly', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('newProject.title')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('newProject.input.placeholder')).toBeInTheDocument()
    expect(screen.getByText('newProject.question.automation')).toBeInTheDocument()
    expect(screen.getByText('newProject.question.test')).toBeInTheDocument()
    expect(screen.getByText('button.back.text')).toBeInTheDocument()
    expect(screen.getByText('button.create.text')).toBeInTheDocument()
  })

  it('shows add-ons section', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('newProject.addons.title')).toBeInTheDocument()
    expect(screen.getByText('newProject.addons.accessibility')).toBeInTheDocument()
  })
})
