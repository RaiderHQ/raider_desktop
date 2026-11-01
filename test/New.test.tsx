import { render, screen, act, fireEvent } from '@testing-library/react'
import CreateProject from '@pages/New'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router'

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

const versionState = { version: '3.12.0' }
vi.mock('@foundation/Stores/versionStore', async (importActual) => {
  const actual = await importActual<typeof import('@foundation/Stores/versionStore')>()
  return {
    ...actual,
    __esModule: true,
    default: (selector: (state: { version: string }) => unknown): unknown => selector(versionState)
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
    versionState.version = '3.12.0'
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
    versionState.version = version
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

  it('offers Mobile app and examples from gem 3.12.0', async (): Promise<void> => {
    await renderPage()
    expect(screen.getByRole('radio', { name: 'newProject.target.mobile' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.queryByText('newProject.target.mobileNeedsUpdate')).not.toBeInTheDocument()
  })

  it('moves the selection with ArrowRight', async (): Promise<void> => {
    await renderPage()
    const web = screen.getByRole('radio', { name: 'newProject.target.web' })
    expect(web).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(web, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'newProject.target.mobile' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })
})
