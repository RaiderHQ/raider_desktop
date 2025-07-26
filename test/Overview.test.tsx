import { render, screen, act } from '@testing-library/react'
import Overview from '@pages/Overview'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import useProjectStore from '@foundation/Stores/projectStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

vi.mock('@components/Library/Folder', () => ({
  default: ({ name }: { name: string | undefined }): JSX.Element => (
    <div data-testid="folder">{name}</div>
  )
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const original = await vi.importActual('react-router-dom')
  return {
    ...original,
    useNavigate: (): (() => void) => mockNavigate
  }
})

const mockApi = {
  readDirectory: vi.fn().mockResolvedValue([]),
  onTestRunStatus: vi.fn(),
  removeTestRunStatusListener: vi.fn()
}

beforeEach(() => {
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
})

describe('Overview Page', (): void => {
  it('renders correctly with a project path', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(screen.getByTestId('folder')).toHaveTextContent('project')
  })

  it('navigates to /start-project if no project path is set', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: null, files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith('/start-project')
  })
})
