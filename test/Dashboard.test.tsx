import { render, screen, fireEvent, act } from '@testing-library/react'
import Dashboard from '@pages/Dashboard'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

vi.mock('@components/ProjectDashboard', () => ({
  default: (): JSX.Element => <div>Project Dashboard</div>
}))

vi.mock('@components/RecordingDashboard', () => ({
  default: (): JSX.Element => <div>Recording Dashboard</div>
}))

vi.mock('@foundation/Stores/runOutputStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    runOutput: ''
  }))
}))

describe('Dashboard Page', () => {
  it('renders the main tabs correctly', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.getByText('dashboard.tabs.project')).toBeInTheDocument()
    expect(screen.getByText('dashboard.tabs.recording')).toBeInTheDocument()
  })

  it('shows Project Dashboard by default', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    expect(screen.getByText('Project Dashboard')).toBeInTheDocument()
  })

  it('switches to Recording Dashboard tab', async () => {
    await act(async () => {
      render(<Dashboard />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('dashboard.tabs.recording'))
    })
    expect(screen.getByText('Recording Dashboard')).toBeInTheDocument()
  })
})
