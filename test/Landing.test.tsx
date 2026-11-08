import { render, screen, act, fireEvent, within } from '@testing-library/react'
import Landing from '@pages/Landing'
import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import useRubyStore from '@foundation/Stores/rubyStore'
import useVersionStore from '@foundation/Stores/versionStore'
import useOverlayStore from '@foundation/Stores/overlayStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, options?: Record<string, unknown>) => string } => ({
    t: (key: string, options?: Record<string, unknown>): string =>
      options ? `${key} ${JSON.stringify(options)}` : key
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
  removeRecentProject: vi.fn(),
  // `raider version`: the home page reads the gem version when it opens
  runCommand: vi.fn(),
  isRubyInstalled: vi.fn(),
  installGems: vi.fn(),
  selectFolder: vi.fn(),
  closeApp: vi.fn()
}

// Set before the stores load: the version store reads the gem version once at import
// @ts-expect-error - Mocking window.api
window.api = api
api.runCommand.mockResolvedValue({ success: true, output: '4.0.1' })

const READY = {
  checked: true,
  rubyCommand: 'ruby',
  rubyVersion: '3.2.8',
  versionWarning: null,
  missingGems: [],
  gemPrefix: '',
  checkFailed: false,
  rechecking: false
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listQuickProjects.mockResolvedValue([])
  api.listRecentProjects.mockResolvedValue([])
  api.removeRecentProject.mockResolvedValue([])
  api.runCommand.mockResolvedValue({ success: true, output: '4.0.1' })
  api.isRubyInstalled.mockResolvedValue({
    success: true,
    rubyCommand: 'ruby',
    rubyVersion: '3.2.8',
    missingGems: []
  })
  api.installGems.mockResolvedValue({ success: true })
  // @ts-expect-error - Mocking window.api
  window.api = api
  useRubyStore.setState(READY)
  useVersionStore.setState({ version: null })
  useOverlayStore.setState({ pageModalOpen: false, conceptsRequest: 0 })
})

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), success: vi.fn() })
}))

vi.mock('@components/RubyInstallModal', () => ({
  default: ({
    onClose,
    onCloseApp
  }: {
    onClose: () => void
    onCloseApp?: () => void
  }): JSX.Element => (
    <div>
      ruby-install-modal
      <button onClick={onClose}>close-ruby-modal</button>
      {onCloseApp && <button onClick={onCloseApp}>close-app</button>}
    </div>
  )
}))
vi.mock('@components/RubyGemsInstallModal', () => ({
  default: ({
    missingGems,
    onInstall,
    onClose
  }: {
    missingGems: string[]
    onInstall: () => void
    onClose: () => void
  }): JSX.Element => (
    <div>
      gems-install-modal {missingGems.join(',')}
      <button onClick={onInstall}>install-gems</button>
      <button onClick={onClose}>close-gems-modal</button>
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
  it('shows the title, the subtitle and no speech bubble', async (): Promise<void> => {
    await renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('landing.title')
    expect(screen.getByText('landing.subtitle')).toBeInTheDocument()
    expect(screen.queryByText('landing.bubble')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.help' })).not.toBeInTheDocument()
  })

  describe('start buttons', () => {
    it('Record a test is the primary button, with its one line, and opens Quick record', async () => {
      await renderLanding()
      const record = screen.getByRole('button', { name: 'landing.start.record' })
      expect(record).toBeEnabled()
      expect(screen.getByText('landing.start.recordHint')).toBeInTheDocument()
      expect(screen.queryByText('quick-record-dialog')).not.toBeInTheDocument()
      await act(async () => {
        fireEvent.click(record)
      })
      expect(screen.getByText('quick-record-dialog')).toBeInTheDocument()
    })

    it('New project… shows its shortcut and goes to the New page', async () => {
      await renderLanding()
      const button = screen.getByRole('button', { name: /landing\.start\.newProject/ })
      expect(button).toHaveTextContent(/⌘⇧N|Ctrl\+Shift\+N/)
      fireEvent.click(button)
      expect(screen.getByTestId('location')).toHaveTextContent('/new')
    })

    it('Open project… shows its shortcut and opens the chosen folder on the Overview', async () => {
      api.selectFolder.mockResolvedValue('/work/shop')
      await renderLanding()
      const button = screen.getByRole('button', { name: /landing\.start\.openProject/ })
      expect(button).toHaveTextContent(/⌘O|Ctrl\+O/)
      await act(async () => {
        fireEvent.click(button)
      })
      expect(setProjectPath).toHaveBeenCalledWith('/work/shop')
      expect(screen.getByTestId('location')).toHaveTextContent('/overview')
    })

    it('the start buttons have the landing tooltips on focus', async () => {
      await renderLanding()
      fireEvent.focus(screen.getByRole('button', { name: /landing\.start\.newProject/ }))
      expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.landing.create')
    })

    it('How Ruby Raider works is a text link that asks for the one concepts modal', async () => {
      await renderLanding()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'header.howItWorks' }))
      })
      expect(useOverlayStore.getState().conceptsRequest).toBe(1)
    })

    it('the shortcut chips are announced by the buttons, not read as text', async () => {
      await renderLanding()
      const button = screen.getByRole('button', { name: /landing\.start\.newProject/ })
      expect(button.getAttribute('aria-keyshortcuts')).toMatch(/^(Meta|Control)\+Shift\+N$/)
      expect(button.querySelector('kbd')).toHaveAttribute('aria-hidden', 'true')
      expect(
        screen
          .getByRole('button', { name: /landing\.start\.openProject/ })
          .getAttribute('aria-keyshortcuts')
      ).toMatch(/^(Meta|Control)\+O$/)
    })

    it('while Quick record is open, the menu bar knows a page modal is up', async () => {
      await renderLanding()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.start.record' }))
      })
      expect(useOverlayStore.getState().pageModalOpen).toBe(true)
    })
  })

  describe('setup line', () => {
    it('says Ruby and Ruby Raider are ready', async () => {
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
      expect(screen.getByTestId('setup-line')).toHaveTextContent('3.2.8')
      expect(screen.getByTestId('setup-line')).toHaveTextContent('4.0.1')
      expect(screen.queryByRole('button', { name: 'landing.setup.fix' })).not.toBeInTheDocument()
    })

    it('while Ruby is being checked, says so and Record a test waits', async () => {
      useRubyStore.setState({ checked: false, rubyCommand: null, rubyVersion: null })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.checking')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeDisabled()
    })

    it('without Ruby: says so, Record a test is disabled with the reason, Fix… opens the Ruby help', async () => {
      useRubyStore.setState({ checked: true, rubyCommand: null, rubyVersion: null })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.noRuby')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeDisabled()
      expect(screen.getByText('landing.start.notReady')).toBeInTheDocument()
      expect(screen.queryByText('landing.start.recordHint')).not.toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      expect(screen.getByText('ruby-install-modal')).toBeInTheDocument()
      // Opened by choice: its second button must not quit the app
      expect(screen.queryByText('close-app')).not.toBeInTheDocument()
      expect(useOverlayStore.getState().pageModalOpen).toBe(true)
    })

    it('with gems missing: names them, Fix… opens the gems help and installs, then checks again', async () => {
      useRubyStore.setState({
        checked: true,
        rubyCommand: 'rbenv exec',
        gemPrefix: 'rbenv exec',
        rubyVersion: '3.2.8',
        missingGems: ['ruby_raider', 'rspec']
      })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.missingGems')
      expect(screen.getByTestId('setup-line')).toHaveTextContent('ruby_raider, rspec')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeDisabled()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      expect(screen.getByText(/gems-install-modal ruby_raider,rspec/)).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByText('install-gems'))
      })
      expect(api.installGems).toHaveBeenCalledWith('rbenv exec', ['ruby_raider', 'rspec'])
      expect(api.isRubyInstalled).toHaveBeenCalled()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeEnabled()
    })

    it('with Ruby Raider older than 4.0: says so, Fix… offers to install ruby_raider', async () => {
      api.runCommand.mockResolvedValue({ success: true, output: '3.1.2' })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.tooOld')
      expect(screen.getByTestId('setup-line')).toHaveTextContent('3.1.2')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeDisabled()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      expect(screen.getByText('gems-install-modal ruby_raider')).toBeInTheDocument()
    })

    it('Fix… for an old gem installs with the Ruby prefix, not the ruby command', async () => {
      const rbenv = 'eval "$(rbenv init -)" && rbenv shell 3.2.8 &&'
      useRubyStore.setState({ rubyCommand: `${rbenv} ruby`, gemPrefix: rbenv })
      api.runCommand.mockResolvedValue({ success: true, output: '3.1.2' })
      await renderLanding()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByText('install-gems'))
      })
      expect(api.installGems).toHaveBeenCalledWith(rbenv, ['ruby_raider'])
    })

    it('while Fix… installs, the line says it is checking and offers no second Fix…', async () => {
      api.runCommand.mockResolvedValue({ success: true, output: '3.1.2' })
      let finish!: (value: { success: boolean }) => void
      api.installGems.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      await renderLanding()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByText('install-gems'))
      })
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.checking')
      expect(screen.queryByRole('button', { name: 'landing.setup.fix' })).not.toBeInTheDocument()
      expect(useOverlayStore.getState().pageModalOpen).toBe(false)
      api.runCommand.mockResolvedValue({ success: true, output: '4.0.1' })
      await act(async () => finish({ success: true }))
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
    })

    it('with the gem version already known, it shows at once and refreshes quietly', async () => {
      useVersionStore.setState({ version: '4.0.1' })
      api.runCommand.mockReturnValue(new Promise(() => {}))
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeEnabled()
      expect(api.runCommand).toHaveBeenCalledWith('raider version')
    })

    it('when the check itself failed: says so, not "no Ruby", and Check again asks again', async () => {
      useRubyStore.setState({ checked: true, checkFailed: true, rubyCommand: null })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.checkFailed')
      expect(screen.getByTestId('setup-line')).not.toHaveTextContent('landing.setup.noRuby')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.retry' }))
      })
      expect(api.isRubyInstalled).toHaveBeenCalled()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
    })

    it('when Ruby Raider cannot be read: says so and Fix… offers to install it', async () => {
      api.runCommand.mockResolvedValue({ success: false, output: '' })
      await renderLanding()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.noRaider')
      expect(screen.getByRole('button', { name: 'landing.start.record' })).toBeDisabled()
    })

    it('closing the Ruby help checks again', async () => {
      useRubyStore.setState({ checked: true, rubyCommand: null, rubyVersion: null })
      await renderLanding()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'landing.setup.fix' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByText('close-ruby-modal'))
      })
      expect(screen.queryByText('ruby-install-modal')).not.toBeInTheDocument()
      expect(api.isRubyInstalled).toHaveBeenCalled()
      expect(screen.getByTestId('setup-line')).toHaveTextContent('landing.setup.ready')
    })
  })

  describe('layout', () => {
    it('with nothing recent, the start comes first with the large logo layout', async () => {
      await renderLanding()
      expect(screen.getByTestId('landing')).toHaveAttribute('data-layout', 'start')
    })

    it('with recent projects or quick recordings, they come first under one compact row of start buttons', async () => {
      api.listQuickProjects.mockResolvedValue([
        { path: '/data/quick-record/shop_test', name: 'shop_test', modifiedAt: 2 }
      ])
      await renderLanding()
      expect(screen.getByTestId('landing')).toHaveAttribute('data-layout', 'recents')
      const row = screen.getByTestId('start-row')
      expect(within(row).getByRole('button', { name: 'landing.start.record' })).toBeInTheDocument()
      expect(
        within(row).getByRole('button', { name: /landing\.start\.newProject/ })
      ).toBeInTheDocument()
      expect(
        within(row).getByRole('button', { name: /landing\.start\.openProject/ })
      ).toBeInTheDocument()
      expect(screen.queryByText('landing.subtitle')).not.toBeInTheDocument()
      const list = screen.getByRole('region', { name: 'landing.quickRecordings.title' })
      expect(row.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('in the compact row, the reason Record a test is disabled is shown as text too', async () => {
      useRubyStore.setState({ checked: true, rubyCommand: null, rubyVersion: null })
      api.listQuickProjects.mockResolvedValue([
        { path: '/data/quick-record/shop_test', name: 'shop_test', modifiedAt: 2 }
      ])
      await renderLanding()
      expect(screen.getByTestId('landing')).toHaveAttribute('data-layout', 'recents')
      expect(screen.getByText('landing.start.notReady')).toBeInTheDocument()
    })
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
      fireEvent.click(within(rows[0]).getByRole('button', { name: /^shop/ }))
      expect(setProjectPath).toHaveBeenCalledWith('/work/shop')
      expect(screen.getByTestId('location')).toHaveTextContent('/overview')
    })

    it('a folder that is gone is greyed, says so, and only offers Remove', async () => {
      api.listRecentProjects.mockResolvedValue([gone])
      await renderLanding()
      const row = screen.getByRole('listitem')
      expect(row).toHaveTextContent('landing.recentProjects.folderNotFound')
      expect(within(row).queryByRole('button', { name: /^gone/ })).toBeNull()
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
      expect(within(row).queryByRole('button', { name: /^shop/ })).toBeNull()
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
