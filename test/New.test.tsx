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
    default: create<{ version: string | null; loadVersion: () => Promise<void> }>(() => ({
      version: '4.0.0',
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
    useVersionStore.setState({ version: '4.0.0', loadVersion: async (): Promise<void> => {} })
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
    // Web projects only: no Website / Mobile app choice and no phones picker
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/mobile/i)).not.toBeInTheDocument()
    expect(screen.getByText('button.back.text')).toBeInTheDocument()
    expect(screen.getByText('button.create.text')).toBeInTheDocument()
  })

  it('the project name field has a tooltip', async (): Promise<void> => {
    await act(async (): Promise<void> => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })
    fireEvent.focus(screen.getByPlaceholderText('newProject.input.placeholder'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.newProject.name')
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
      'selenium',
      '/usr/bin/ruby',
      { accessibility: false, ci: 'azure', examples: true }
    )
  })

  it('has no automation select and no Watir', async (): Promise<void> => {
    await renderPage()
    expect(screen.queryByText('newProject.question.automation')).not.toBeInTheDocument()
    expect(screen.queryByText(/watir/i)).not.toBeInTheDocument()
  })

  it('sends selenium and the web options', async (): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    await create(run)
    expect(run).toHaveBeenCalledWith(
      '/tmp/projects',
      'proj',
      'selenium',
      '/usr/bin/ruby',
      {
        accessibility: false,
        ci: 'github',
        examples: true
      }
    )
  })

  it('sends accessibility and Azure Pipelines when chosen', async (): Promise<void> => {
    const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: /newProject.addons.accessibility/ }))
    fireEvent.change(screen.getByDisplayValue('newProject.ci.github'), {
      target: { value: 'newProject.ci.azure' }
    })
    await create(run)
    expect(run).toHaveBeenCalledWith('/tmp/projects', 'proj', 'selenium', '/usr/bin/ruby', {
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
    expect(run.mock.calls[0][4]).toEqual({ accessibility: false, ci: 'github', examples: false })
  })

  describe('gem below the 4.0 runtime', () => {
    const createButton = (): HTMLElement =>
      screen.getByText('button.create.text').closest('button')!

    it.each([
      ['3.15.0', '3.15.0'],
      ['unknown', null]
    ])('cannot create a project on gem %s', async (_label, version): Promise<void> => {
      useVersionStore.setState({ version })
      const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
      await renderPage()

      expect(screen.getByRole('alert')).toHaveTextContent('newProject.gemNeedsUpdate')
      expect(
        screen.queryByRole('checkbox', { name: /newProject.addons.examples/ })
      ).not.toBeInTheDocument()

      // A valid name is not enough: the gem has to be updated first
      await create(run)
      expect(createButton()).toBeDisabled()
      expect(run).not.toHaveBeenCalled()
    })

    it('creates a project with examples from gem 4.0.0', async (): Promise<void> => {
      const run = vi.fn().mockResolvedValue({ success: false, error: 'stop' })
      await renderPage()

      expect(screen.queryByText('newProject.gemNeedsUpdate')).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /newProject.addons.examples/ })).toBeChecked()
      fireEvent.change(screen.getByPlaceholderText('newProject.input.placeholder'), {
        target: { value: 'proj' }
      })
      expect(createButton()).toBeEnabled()

      await create(run)
      expect(run).toHaveBeenCalledTimes(1)
      expect(run.mock.calls[0][4]).toEqual({ accessibility: false, ci: 'github', examples: true })
    })
  })

  it('reads the gem version again each time the page opens', async (): Promise<void> => {
    const versions = ['3.15.0', '4.0.0']
    const loadVersion = vi.fn(async (): Promise<void> => {
      useVersionStore.setState({ version: versions.shift() as string })
    })
    useVersionStore.setState({ version: '3.15.0', loadVersion })
    const createButton = (): HTMLElement =>
      screen.getByText('button.create.text').closest('button')!

    const first = render(
      <MemoryRouter>
        <CreateProject />
      </MemoryRouter>
    )
    await act(async (): Promise<void> => {})
    expect(screen.getByRole('alert')).toHaveTextContent('newProject.gemNeedsUpdate')
    first.unmount()

    // Ruby Raider was updated meanwhile
    await renderPage()
    expect(loadVersion).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('newProject.gemNeedsUpdate')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('newProject.input.placeholder'), {
      target: { value: 'proj' }
    })
    expect(createButton()).toBeEnabled()
  })

  describe('project name rule (D13)', () => {
    const nameInput = (): HTMLElement => screen.getByPlaceholderText('newProject.input.placeholder')
    const createButton = (): HTMLElement =>
      screen.getByText('button.create.text').closest('button')!

    it('states the rule under the field before anything is typed', async (): Promise<void> => {
      await renderPage()
      expect(nameInput()).toHaveAccessibleDescription('newProject.input.hint')
      expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true')
      expect(createButton()).toBeDisabled()
    })

    it('flags a name with spaces inline and keeps Create off', async (): Promise<void> => {
      await renderPage()
      fireEvent.change(nameInput(), { target: { value: 'ux test project' } })
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('alert')).toHaveTextContent('newProject.input.invalid')
      expect(createButton()).toBeDisabled()
    })

    it('enables Create for a valid name', async (): Promise<void> => {
      await renderPage()
      fireEvent.change(nameInput(), { target: { value: 'ux_test_project' } })
      expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true')
      expect(createButton()).toBeEnabled()
    })
  })

  describe('creation failure (D5)', () => {
    it('shows a one-line toast with the details kept behind an expander', async (): Promise<void> => {
      const { default: toast, Toaster } = await import('react-hot-toast')
      toast.remove()
      window.matchMedia = (): MediaQueryList =>
        ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as never
      render(<Toaster />)
      const trace =
        'x.rb:3: invalid multibyte char (US-ASCII) (SyntaxError)\n  from a.rb:1\n  from b.rb:2'
      const run = vi.fn().mockResolvedValue({ success: false, error: trace })
      await renderPage()
      await create(run)
      expect(await screen.findByText('newProject.alerts.creationFailed')).toBeInTheDocument()
      expect(screen.queryByText(/invalid multibyte/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'errorToast.showDetails' })).toBeInTheDocument()
    })
  })
})
