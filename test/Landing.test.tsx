import { render, screen, act, fireEvent, within } from '@testing-library/react'
import Landing from '@pages/Landing'
import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

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

const api = {
  listQuickProjects: vi.fn(),
  listRecentProjects: vi.fn(),
  removeRecentProject: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listQuickProjects.mockResolvedValue([])
  api.listRecentProjects.mockResolvedValue([])
  api.removeRecentProject.mockResolvedValue([])
  // @ts-expect-error - Mocking window.api
  window.api = api
})

vi.mock('@components/ProjectSelector', () => ({
  default: ({
    description,
    buttonValue,
    url,
    onClick,
    tooltip
  }: {
    description: string
    buttonValue: string
    url?: string
    onClick?: () => void
    tooltip?: string
  }): JSX.Element => (
    <div data-tooltip={tooltip}>
      <p>{description}</p>
      {url && <a href={url}>{url}</a>}
      <button onClick={onClick}>{buttonValue}</button>
    </div>
  )
}))

vi.mock('@components/QuickRecordDialog', () => ({
  default: (): JSX.Element => <div>quick-record-dialog</div>
}))

const LocationProbe = (): JSX.Element => <div data-testid="location">{useLocation().pathname}</div>

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

  it('the three landing cards have tooltips on focus', async (): Promise<void> => {
    let container!: HTMLElement
    await act(async () => {
      ;({ container } = render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      ))
    })
    const tips = Array.from(container.querySelectorAll('[data-tooltip]')).map((n) =>
      n.getAttribute('data-tooltip')
    )
    expect(tips).toEqual([
      'tooltips.landing.quickRecord',
      'tooltips.landing.create',
      'tooltips.landing.open'
    ])
    fireEvent.focus(screen.getByRole('button', { name: 'landing.logoLabel' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.landing.logo')
  })

  describe('Quick recordings', () => {
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

  describe('recent projects (U8)', () => {
    const shop = { path: '/work/shop', name: 'shop', lastOpened: 2, exists: true, isRaider: true }
    const gone = { path: '/work/gone', name: 'gone', lastOpened: 1, exists: false, isRaider: false }

    it('are not shown when there are none', async () => {
      await renderLanding()
      expect(api.listRecentProjects).toHaveBeenCalled()
      expect(screen.queryByText('landing.recentProjects.title')).not.toBeInTheDocument()
    })

    it('lists them newest first and opens one on the Overview with no folder dialog', async () => {
      api.listRecentProjects.mockResolvedValue([shop, gone])
      await renderLanding()
      expect(screen.getByText('landing.recentProjects.title')).toBeInTheDocument()
      const section = screen.getByRole('region', { name: 'landing.recentProjects.title' })
      const rows = within(section).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent('shop')
      expect(rows[1]).toHaveTextContent('gone')
      fireEvent.click(within(rows[0]).getByRole('button', { name: /shop/ }))
      expect(setProjectPath).toHaveBeenCalledWith('/work/shop')
      expect(screen.getByTestId('location')).toHaveTextContent('/overview')
    })

    it('a folder that is gone is greyed, says so, and only offers Remove', async () => {
      api.listRecentProjects.mockResolvedValue([gone])
      await renderLanding()
      const row = screen.getByRole('listitem')
      expect(row).toHaveTextContent('landing.recentProjects.folderNotFound')
      expect(within(row).queryByRole('button', { name: /gone/ })).toBeNull()
      expect(
        within(row).getByRole('button', { name: /landing.recentProjects.removeLabel/ })
      ).toBeInTheDocument()
      expect(setProjectPath).not.toHaveBeenCalled()
    })

    it('a folder that lost its Raider config is greyed, says so, and only offers Remove', async () => {
      api.listRecentProjects.mockResolvedValue([{ ...shop, isRaider: false }])
      await renderLanding()
      const row = screen.getByRole('listitem')
      expect(row).toHaveTextContent('landing.recentProjects.notRaider')
      expect(within(row).queryByRole('button', { name: /shop/ })).toBeNull()
      expect(setProjectPath).not.toHaveBeenCalled()
    })

    it('Remove takes the entry out of the list main returns', async () => {
      api.listRecentProjects.mockResolvedValue([shop, gone])
      api.removeRecentProject.mockResolvedValue([shop])
      await renderLanding()
      const rows = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('gone'))
      await act(async () => {
        fireEvent.click(
          within(rows[0]).getByRole('button', { name: /landing.recentProjects.removeLabel/ })
        )
      })
      expect(api.removeRecentProject).toHaveBeenCalledWith('/work/gone')
      expect(screen.queryByText('gone')).not.toBeInTheDocument()
      expect(screen.getByText('shop')).toBeInTheDocument()
    })
  })
})
