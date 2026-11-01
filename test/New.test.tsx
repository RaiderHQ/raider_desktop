import { render, screen, act, fireEvent } from '@testing-library/react'
import CreateProject from '@pages/New'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import useVersionStore from '@foundation/Stores/versionStore'

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

vi.mock('@foundation/Stores/versionStore', async (importActual) => {
  const actual = await importActual<typeof import('@foundation/Stores/versionStore')>()
  const { create } = await import('zustand')
  return {
    ...actual,
    __esModule: true,
    default: create<{ version: string; loadVersion: () => Promise<void> }>(() => ({
      version: '3.12.0',
      loadVersion: async (): Promise<void> => {}
    }))
  }
})

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn()
  }))
}))

const renderPage = async (): Promise<void> => {
  await act(async (): Promise<void> => {
    render(
      <MemoryRouter>
        <CreateProject />
      </MemoryRouter>
    )
  })
}

const create = async (runRubyRaider: ReturnType<typeof vi.fn>): Promise<void> => {
  ;(window as unknown as { api: unknown }).api = {
    selectFolder: vi.fn().mockResolvedValue('/tmp/projects'),
    runRubyRaider
  }
  fireEvent.change(screen.getByPlaceholderText('newProject.input.placeholder'), {
    target: { value: 'proj' }
  })
  await act(async (): Promise<void> => {
    fireEvent.click(screen.getByText('button.create.text'))
  })
}

describe('CreateProject Page', (): void => {
  beforeEach(() => {
    useVersionStore.setState({ version: '3.12.0', loadVersion: async (): Promise<void> => {} })
  })

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
    expect(screen.getByText('newProject.question.target')).toBeInTheDocument()
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

  it('passes ci: azure to runRubyRaider when Azure Pipelines is chosen', async (): Promise<void> => {
    const runRubyRaider = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    ;(window as unknown as { api: unknown }).api = {
      selectFolder: vi.fn().mockResolvedValue('/tmp/projects'),
      runRubyRaider
    }
    await act(async (): Promise<void> => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('newProject.ci.label')).toBeInTheDocument()
    const select = screen.getByDisplayValue('newProject.ci.github')
    fireEvent.change(select, { target: { value: 'newProject.ci.azure' } })
    fireEvent.change(screen.getByPlaceholderText('newProject.input.placeholder'), {
      target: { value: 'proj' }
    })
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByText('button.create.text'))
    })

    expect(runRubyRaider).toHaveBeenCalledWith(
      '/tmp/projects',
      'proj',
      'rspec',
      'selenium',
      '/usr/bin/ruby',
      null,
      { accessibility: false, ci: 'azure', examples: true }
    )
  })

  it('has no automation select and no Watir', async (): Promise<void> => {
    await renderPage()
    expect(screen.queryByText('newProject.question.automation')).not.toBeInTheDocument()
    expect(screen.queryByText(/watir/i)).not.toBeInTheDocument()
  })

  it('sends selenium and a null mobile for Website', async (): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    await create(run)
    expect(run).toHaveBeenCalledWith('/tmp/projects', 'proj', 'rspec', 'selenium', '/usr/bin/ruby', null, {
      accessibility: false,
      ci: 'github',
      examples: true
    })
  })

  it.each([
    ['newProject.phones.ios', 'ios'],
    ['newProject.phones.android', 'android'],
    ['newProject.phones.both', 'cross_platform']
  ])('sends mobile %s as %s, ignoring web-only choices', async (label, value): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: /newProject.addons.accessibility/ }))
    fireEvent.change(screen.getByDisplayValue('newProject.ci.github'), {
      target: { value: 'newProject.ci.azure' }
    })
    fireEvent.click(screen.getByRole('radio', { name: 'newProject.target.mobile' }))
    fireEvent.click(screen.getByRole('radio', { name: label }))
    await create(run)
    expect(run).toHaveBeenCalledWith('/tmp/projects', 'proj', 'rspec', 'selenium', '/usr/bin/ruby', value, {
      accessibility: false,
      ci: 'github',
      examples: true
    })
  })

  it('hides web-only add-ons under Mobile app and restores them on Website', async (): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: /newProject.addons.accessibility/ }))
    fireEvent.change(screen.getByDisplayValue('newProject.ci.github'), {
      target: { value: 'newProject.ci.azure' }
    })
    fireEvent.click(screen.getByRole('radio', { name: 'newProject.target.mobile' }))
    expect(screen.queryByRole('checkbox', { name: /newProject.addons.accessibility/ })).not.toBeInTheDocument()
    expect(screen.getByText('newProject.ci.mobileAzure')).toBeInTheDocument()
    expect(screen.queryByText('newProject.ci.azure')).not.toBeInTheDocument()
    expect(screen.getByText('newProject.question.phones')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'newProject.target.web' }))
    await create(run)
    expect(run).toHaveBeenCalledWith('/tmp/projects', 'proj', 'rspec', 'selenium', '/usr/bin/ruby', null, {
      accessibility: true,
      ci: 'azure',
      examples: true
    })
  })

  it('includes example tests by default and sends examples: false when unchecked', async (): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    const box = screen.getByRole('checkbox', { name: /newProject.addons.examples/ })
    expect(box).toBeChecked()
    fireEvent.click(box)
    await create(run)
    expect(run.mock.calls[0][6]).toEqual({ accessibility: false, ci: 'github', examples: false })
  })

  it('keeps the examples checkbox under Mobile app', async (): Promise<void> => {
    await renderPage()
    fireEvent.click(screen.getByRole('radio', { name: 'newProject.target.mobile' }))
    expect(screen.getByRole('checkbox', { name: /newProject.addons.examples/ })).toBeChecked()
  })

  it.each(['3.11.0', '2.0.0'])('gates Mobile app and examples on gem %s', async (version): Promise<void> => {
    useVersionStore.setState({ version })
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    const mobile = screen.getByRole('radio', { name: 'newProject.target.mobile' })
    expect(mobile).toHaveAttribute('aria-disabled', 'true')
    expect(mobile).toHaveAccessibleDescription('newProject.target.mobileNeedsUpdate')
    fireEvent.click(mobile)
    expect(screen.queryByText('newProject.question.phones')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /newProject.addons.examples/ })).not.toBeInTheDocument()
    await create(run)
    expect(run.mock.calls[0][6]).toEqual({ accessibility: false, ci: 'github' })
  })

  it('reads the gem version again each time the page opens', async (): Promise<void> => {
    const versions = ['3.11.0', '3.12.0']
    const loadVersion = vi.fn(async (): Promise<void> => {
      useVersionStore.setState({ version: versions.shift() as string })
    })
    useVersionStore.setState({ version: '3.11.0', loadVersion })
    const mobile = (): HTMLElement => screen.getByRole('radio', { name: 'newProject.target.mobile' })

    const first = render(
      <MemoryRouter>
        <CreateProject />
      </MemoryRouter>
    )
    await act(async (): Promise<void> => {})
    expect(mobile()).toHaveAttribute('aria-disabled', 'true')
    first.unmount()

    // Ruby Raider was updated meanwhile
    await renderPage()
    expect(loadVersion).toHaveBeenCalledTimes(2)
    expect(mobile()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('offers Mobile app and examples from gem 3.12.0', async (): Promise<void> => {
    await renderPage()
    expect(screen.getByRole('radio', { name: 'newProject.target.mobile' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.queryByText('newProject.target.mobileNeedsUpdate')).not.toBeInTheDocument()
  })

  describe('target keyboard navigation', () => {
    const radio = (name: string): HTMLElement => screen.getByRole('radio', { name })
    const web = (): HTMLElement => radio('newProject.target.web')
    const mobile = (): HTMLElement => radio('newProject.target.mobile')

    it('moves the selection with ArrowRight and ArrowLeft', async (): Promise<void> => {
      await renderPage()
      expect(web()).toHaveAttribute('aria-checked', 'true')
      fireEvent.keyDown(web(), { key: 'ArrowRight' })
      expect(mobile()).toHaveAttribute('aria-checked', 'true')
      fireEvent.keyDown(mobile(), { key: 'ArrowLeft' })
      expect(web()).toHaveAttribute('aria-checked', 'true')
    })

    it('wraps at both ends', async (): Promise<void> => {
      await renderPage()
      fireEvent.keyDown(web(), { key: 'ArrowLeft' })
      expect(mobile()).toHaveAttribute('aria-checked', 'true')
      fireEvent.keyDown(mobile(), { key: 'ArrowRight' })
      expect(web()).toHaveAttribute('aria-checked', 'true')
    })

    it('jumps with Home and End', async (): Promise<void> => {
      await renderPage()
      fireEvent.keyDown(web(), { key: 'End' })
      expect(mobile()).toHaveAttribute('aria-checked', 'true')
      fireEvent.keyDown(mobile(), { key: 'Home' })
      expect(web()).toHaveAttribute('aria-checked', 'true')
    })

    it('has exactly one tabbable radio', async (): Promise<void> => {
      await renderPage()
      const tabbableIn = (group: HTMLElement): number =>
        Array.from(group.querySelectorAll('[role="radio"]')).filter(
          (r) => r.getAttribute('tabindex') === '0'
        ).length
      expect(tabbableIn(screen.getByRole('radiogroup'))).toBe(1)
      fireEvent.keyDown(web(), { key: 'ArrowRight' })
      const groups = screen.getAllByRole('radiogroup')
      expect(groups).toHaveLength(2)
      groups.forEach((group) => expect(tabbableIn(group)).toBe(1))
    })

    it('keeps Website selected on ArrowRight when Mobile app is disabled', async (): Promise<void> => {
      useVersionStore.setState({ version: '3.11.0' })
      await renderPage()
      fireEvent.keyDown(web(), { key: 'ArrowRight' })
      expect(web()).toHaveAttribute('aria-checked', 'true')
      expect(mobile()).toHaveAttribute('tabindex', '-1')
      expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(
        'newProject.target.mobileNeedsUpdate'
      )
    })
  })
})
