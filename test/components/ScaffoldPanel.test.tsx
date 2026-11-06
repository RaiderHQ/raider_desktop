import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import ScaffoldPanel from '@components/ScaffoldPanel'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, opts?: object) => string } => ({
    t: (key: string, opts?: object): string => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

const mockLoadFiles = vi.fn()

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: Object.assign(
    vi.fn((selector) => {
      const state = { projectPath: '/fake/project' }
      return selector(state)
    }),
    {
      getState: vi.fn(() => ({
        loadFiles: mockLoadFiles
      }))
    }
  )
}))

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn()
  }))
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn()
  }
}))

const mockScaffoldGenerate = vi.fn().mockResolvedValue({
  success: true,
  output: 'Generated page_objects/pages/login.rb'
})

beforeEach(() => {
  vi.clearAllMocks()
  window.api = {
    scaffoldGenerate: mockScaffoldGenerate
  } as unknown as typeof window.api
})

describe('ScaffoldPanel', () => {
  describe('Rendering', () => {
    it('shows type dropdown and name input, each named by its label', () => {
      render(<ScaffoldPanel />)

      expect(screen.getByLabelText('scaffold.type')).toBe(screen.getByRole('combobox'))
      expect(screen.getByLabelText('scaffold.name')).toBe(screen.getByRole('textbox'))
      expect(screen.getByText('scaffold.generate')).toBeInTheDocument()
    })

    it('shows all component type options in the dropdown', () => {
      render(<ScaffoldPanel />)

      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()

      const options = screen.getAllByRole('option')
      const optionTexts = options.map((o) => o.textContent)
      expect(optionTexts).toEqual([
        'scaffold.types.page',
        'scaffold.types.spec',
        'scaffold.types.feature',
        'scaffold.types.steps',
        'scaffold.types.helper',
        'scaffold.types.component'
      ])
    })

    it('shows description text', () => {
      render(<ScaffoldPanel />)

      expect(
        screen.getByText('scaffold.intro')
      ).toBeInTheDocument()
    })

  })

  describe('Tooltips', () => {
    it('Generate has a tooltip', () => {
      render(<ScaffoldPanel />)
      fireEvent.focus(screen.getByText('scaffold.generate'))
      expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.scaffold.generate')
    })
  })

  describe('Validation', () => {
    it('shows error toast when Generate is clicked with empty name', async () => {
      const { toast } = await import('react-hot-toast')
      render(<ScaffoldPanel />)

      fireEvent.click(screen.getByText('scaffold.generate'))

      expect(toast.error).toHaveBeenCalledWith('scaffold.toast.noName')
    })
  })

  describe('Generate operations', () => {
    it('calls scaffoldGenerate with correct params for page generation', async () => {
      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(mockScaffoldGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'generate',
            type: 'page',
            name: 'login'
          }),
          '/fake/project',
          '/usr/bin/ruby'
        )
      })
    })

    it('calls scaffoldGenerate with selected component type', async () => {
      render(<ScaffoldPanel />)

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'spec' } })

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(mockScaffoldGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'generate',
            type: 'spec',
            name: 'login'
          }),
          '/fake/project',
          '/usr/bin/ruby'
        )
      })
    })
  })

  describe('Result feedback', () => {
    it('shows success result after generation', async () => {
      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(
          screen.getByText(/Generated page_objects\/pages\/login\.rb/)
        ).toBeInTheDocument()
      })
    })

    it('shows error result on failed generation', async () => {
      mockScaffoldGenerate.mockResolvedValueOnce({
        success: false,
        output: '',
        error: 'Command not found'
      })

      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(screen.getByText('Command not found')).toBeInTheDocument()
      })
    })

    it('refreshes file tree after successful generation', async () => {
      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(mockLoadFiles).toHaveBeenCalledWith('/fake/project')
      })
    })
  })

  describe('Toast notifications', () => {
    it('shows success toast on successful generation', async () => {
      const { toast } = await import('react-hot-toast')
      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled()
      })
    })

    it('shows error toast on failed generation', async () => {
      mockScaffoldGenerate.mockResolvedValueOnce({
        success: false,
        output: '',
        error: 'Command not found'
      })
      const { toast } = await import('react-hot-toast')
      render(<ScaffoldPanel />)

      const nameInput = screen.getByPlaceholderText('scaffold.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'login' } })

      await act(async () => {
        fireEvent.click(screen.getByText('scaffold.generate'))
      })

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'scaffold.toast.failed:{"error":"Command not found"}'
        )
      })
    })
  })
})
