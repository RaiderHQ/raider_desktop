import { render, screen, act, fireEvent } from '@testing-library/react'
import Landing from '@pages/Landing'
import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, options?: { version: string }) => string } => ({
    t: (key: string, options?: { version: string }): string =>
      options ? `${key} ${options.version}` : key
  })
}))

vi.mock('@foundation/Stores/loadingStore', () => ({
  __esModule: true,
  default: vi.fn(() => vi.fn())
}))

const setProjectPath = vi.hoisted(() => vi.fn())
vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: vi.fn(() => setProjectPath)
}))

const api = { listQuickProjects: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  api.listQuickProjects.mockResolvedValue([])
  // @ts-expect-error - Mocking window.api
  window.api = api
})

vi.mock('@components/ProjectSelector', () => ({
  default: ({
    description,
    buttonValue,
    url,
    onClick
  }: {
    description: string
    buttonValue: string
    url?: string
    onClick?: () => void
  }): JSX.Element => (
    <div>
      <p>{description}</p>
      {url && <a href={url}>{url}</a>}
      <button onClick={onClick}>{buttonValue}</button>
    </div>
  )
}))

vi.mock('@components/QuickRecordDialog', () => ({
  default: (): JSX.Element => <div>quick-record-dialog</div>
}))

describe('Landing Page', (): void => {
  it('renders correctly', async (): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('landing.title')).toBeInTheDocument()
    expect(screen.getByText('landing.subtitle')).toBeInTheDocument()
    expect(screen.getByText('button.create.description')).toBeInTheDocument()
    expect(screen.getByText('button.open.description')).toBeInTheDocument()
  })

  it('has a Quick record card that opens the dialog and no recorder link', async (): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      )
    })
    expect(screen.queryByText('/recorder')).not.toBeInTheDocument()
    expect(screen.queryByText('quick-record-dialog')).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('button.recorder.text'))
    })
    expect(screen.getByText('quick-record-dialog')).toBeInTheDocument()
  })

  describe('Quick recordings', () => {
    const LocationProbe = (): JSX.Element => (
      <div data-testid="location">{useLocation().pathname}</div>
    )
    const renderLanding = async (): Promise<void> => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        )
      })
    }

    it('are not shown when there are none', async () => {
      await renderLanding()
      expect(api.listQuickProjects).toHaveBeenCalled()
      expect(screen.queryByText('landing.quickRecordings.title')).not.toBeInTheDocument()
    })

    it('lists them, newest first as main gives them, and one opens on its tests', async () => {
      api.listQuickProjects.mockResolvedValue([
        { path: '/data/quick-record/shop_test', name: 'shop_test', modifiedAt: 2 },
        { path: '/data/quick-record/blog_test', name: 'blog_test', modifiedAt: 1 }
      ])
      await renderLanding()
      expect(screen.getByText('landing.quickRecordings.title')).toBeInTheDocument()
      const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
      expect(names[0]).toContain('shop_test')
      expect(names[1]).toContain('blog_test')

      fireEvent.click(screen.getByText('blog_test'))
      expect(setProjectPath).toHaveBeenCalledWith('/data/quick-record/blog_test')
      expect(screen.getByTestId('location')).toHaveTextContent('/overview/tests')
    })

    it('a failed listing shows nothing extra', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      api.listQuickProjects.mockRejectedValue(new Error('boom'))
      await renderLanding()
      expect(screen.queryByText('landing.quickRecordings.title')).not.toBeInTheDocument()
      error.mockRestore()
    })
  })
})
