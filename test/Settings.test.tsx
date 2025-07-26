import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Settings from '@pages/Settings'
import '@testing-library/jest-dom'
import useProjectStore from '@foundation/Stores/projectStore'
import { vi } from 'vitest'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // Simple translation mock
  }),
}))

vi.mock('@foundation/Stores/projectStore')

vi.mock('@pages/ProjectSettings', () => ({
  default: () => <div>Project Settings</div>,
}))
vi.mock('@pages/RecorderSettings', () => ({
  default: () => <div>Recording Settings</div>,
}))
vi.mock('@pages/GeneralSettings', () => ({
  default: () => <div>General Settings</div>,
}))
vi.mock('@components/NoProjectLoadedMessage', () => ({
  default: () => <div>No Project Loaded</div>,
}))

describe('Settings Page', () => {
  it('renders the main tabs correctly', async () => {
    // @ts-ignore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    expect(screen.getByText('settings.tabs.general')).toBeInTheDocument()
    expect(screen.getByText('settings.tabs.project')).toBeInTheDocument()
    expect(screen.getByText('settings.tabs.recording')).toBeInTheDocument()
  })

  it('shows General Settings by default', async () => {
    // @ts-ignore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    expect(screen.getByText('General Settings')).toBeInTheDocument()
  })

  it('switches to Project Settings tab', async () => {
    // @ts-ignore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('settings.tabs.project'))
    })
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('switches to Recording Settings tab', async () => {
    // @ts-ignore
    useProjectStore.mockReturnValue('/fake/project/path')
    await act(async () => {
      render(<Settings />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('settings.tabs.recording'))
    })
    expect(screen.getByText('Recording Settings')).toBeInTheDocument()
  })

  it('shows No Project Loaded message when no project is loaded', async () => {
    // @ts-ignore
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
