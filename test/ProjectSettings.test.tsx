import { render, screen, act } from '@testing-library/react'
import ProjectSettings from '@pages/ProjectSettings'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import useProjectStore from '@foundation/Stores/projectStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

const mockApi = {
  isMobileProject: vi.fn(),
  getMobileCapabilities: vi.fn(),
  updateBrowserType: vi.fn(),
  updateBrowserUrl: vi.fn(),
  updateMobileCapabilities: vi.fn(),
  readDirectory: vi.fn().mockResolvedValue([])
}

beforeEach(() => {
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
  useProjectStore.setState({ projectPath: '/fake/project' })
})

describe('ProjectSettings Page', (): void => {
  it('renders loading state initially', async (): Promise<void> => {
    mockApi.isMobileProject.mockResolvedValueOnce(new Promise(() => {})) // Never resolves
    await act(async () => {
      render(<ProjectSettings />)
    })
    expect(screen.getByText('settings.loading')).toBeInTheDocument()
  })

  it('renders web settings for a web project', async (): Promise<void> => {
    mockApi.isMobileProject.mockResolvedValue({
      success: true,
      isMobileProject: false
    })
    await act(async () => {
      render(<ProjectSettings />)
    })
    expect(screen.getByText('settings.header.title')).toBeInTheDocument()
    expect(screen.getByText('settings.section.baseUrl')).toBeInTheDocument()
    expect(screen.getByText('settings.section.browser')).toBeInTheDocument()
  })

  it('renders mobile settings for a mobile project', async (): Promise<void> => {
    mockApi.isMobileProject.mockResolvedValue({
      success: true,
      isMobileProject: true
    })
    mockApi.getMobileCapabilities.mockResolvedValue({
      success: true,
      capabilities: {}
    })
    await act(async () => {
      render(<ProjectSettings />)
    })
    expect(screen.getByText('settings.mobileProject.title')).toBeInTheDocument()
    expect(screen.getByText('settings.section.appiumSettings')).toBeInTheDocument()
  })
})
