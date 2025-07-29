import { render, screen, fireEvent, act } from '@testing-library/react'
import Settings from '@pages/Settings'
import '@testing-library/jest-dom'
import useProjectStore from '@foundation/Stores/projectStore'
import { vi } from 'vitest'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

vi.mock('@foundation/Stores/projectStore')

vi.mock('@pages/ProjectSettings', () => ({
  default: (): JSX.Element => <div>Project Settings</div>
}))
vi.mock('@pages/RecorderSettings', () => ({
  default: (): JSX.Element => <div>Recording Settings</div>
}))
vi.mock('@pages/GeneralSettings', () => ({
  default: (): JSX.Element => <div>General Settings</div>
}))
vi.mock('@components/NoProjectLoadedMessage', () => ({
  default: (): JSX.Element => <div>No Project Loaded</div>
}))

describe('Settings Page', (): void => {
  it('renders the main tabs correctly', async (): Promise<void> => {
    // @ts-expect-error - Mocking useProjectStore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    expect(screen.getByText('settings.tabs.general')).toBeInTheDocument()
    expect(screen.getByText('settings.tabs.project')).toBeInTheDocument()
    expect(screen.getByText('settings.tabs.recording')).toBeInTheDocument()
  })

  it('shows General Settings by default', async (): Promise<void> => {
    // @ts-expect-error - Mocking useProjectStore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    expect(screen.getByText('General Settings')).toBeInTheDocument()
  })

  it('switches to Project Settings tab', async (): Promise<void> => {
    // @ts-expect-error - Mocking useProjectStore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('settings.tabs.project'))
    })
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('switches to Recording Settings tab', async (): Promise<void> => {
    // @ts-expect-error - Mocking useProjectStore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('settings.tabs.recording'))
    })
    expect(screen.getByText('Recording Settings')).toBeInTheDocument()
  })

  it('shows No Project Loaded message when no project is loaded', async (): Promise<void> => {
    // @ts-expect-error - Mocking useProjectStore
    useProjectStore.mockReturnValue(null)
    await act(async () => {
      render(<Settings />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('settings.tabs.project'))
    })
    expect(screen.getByText('No Project Loaded')).toBeInTheDocument()
  })
})
