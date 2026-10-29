import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandBlock from '@components/CommandBlock'
import '@testing-library/jest-dom'
import type { Step } from '@shared/types/step'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, vals?: Record<string, string>) => string } => ({
    t: (key: string, vals?: Record<string, string>): string =>
      vals && Object.keys(vals).length ? `${key} ${JSON.stringify(vals)}` : key
  })
}))

const renderStep = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  renderStep.mockImplementation(async (step: Step) =>
    step.kind === 'custom' ? step.code : `ruby for ${step.id}`
  )
  window.api = { renderStep } as unknown as typeof window.api
})

const baseProps = {
  index: 0,
  showCode: false,
  onDragStart: vi.fn(),
  onDragEnter: vi.fn(),
  onDragEnd: vi.fn(),
  onDelete: vi.fn()
}

const watirClick: Step = {
  id: 'c1',
  kind: 'click',
  element: { strategy: 'id', value: 'login', label: 'Log in' }
}
const navigate: Step = { id: 'n1', kind: 'navigate', url: 'https://example.com' }

const renderBlock = async (
  props: Partial<React.ComponentProps<typeof CommandBlock>>
): Promise<void> => {
  await act(async () => {
    render(<CommandBlock {...baseProps} step={navigate} {...props} />)
  })
}

const startEditing = async (text: string): Promise<HTMLElement> => {
  await act(async () => {
    fireEvent.doubleClick(screen.getByText(text).closest('.cursor-text')!)
  })
  return screen.getByLabelText('Edit command')
}

describe('CommandBlock', () => {
  describe('friendly view', () => {
    it('shows the element label of a click, not Ruby', async () => {
      await renderBlock({ step: watirClick })
      expect(
        screen.getByText('recorder.commandParser.clickElement {"element":"Log in"}')
      ).toBeInTheDocument()
      expect(screen.queryByText(/@browser|@driver/)).not.toBeInTheDocument()
      expect(renderStep).not.toHaveBeenCalled()
    })

    it('shows "Custom code step" for custom steps instead of their code', async () => {
      await renderBlock({ step: { id: 'x', kind: 'custom', code: 'puts "secret ruby"' } })
      expect(screen.getByText('recorder.step.custom')).toBeInTheDocument()
      expect(screen.queryByText(/secret ruby/)).not.toBeInTheDocument()
    })

    describe('secret steps', () => {
      const secret: Step = {
        id: 's',
        kind: 'type',
        element: { strategy: 'id', value: 'pw', label: 'Password' },
        text: '',
        secret: true,
        secretName: 'RAIDER_SECRET_1'
      }
      const rename = async (onEdit: ReturnType<typeof vi.fn>, value: string): Promise<void> => {
        await renderBlock({ step: secret, onEdit })
        fireEvent.click(screen.getByRole('button', { name: 'recorder.step.secretRename' }))
        const input = screen.getByLabelText('recorder.step.secretNameLabel')
        fireEvent.change(input, { target: { value } })
        fireEvent.keyDown(input, { key: 'Enter' })
      }

      it('shows the variable the password comes from', async () => {
        await renderBlock({ step: secret })
        expect(
          screen.getByText(
            'recorder.commandParser.typeSecret {"element":"Password","name":"RAIDER_SECRET_1"}'
          )
        ).toBeInTheDocument()
      })

      it('renames the variable', async () => {
        const onEdit = vi.fn()
        await rename(onEdit, 'ADMIN_PASSWORD')
        expect(onEdit).toHaveBeenCalledWith(0, { ...secret, secretName: 'ADMIN_PASSWORD' })
      })

      it('refuses a name that is not an environment variable name', async () => {
        const onEdit = vi.fn()
        await rename(onEdit, 'admin password')
        expect(onEdit).not.toHaveBeenCalled()
        expect(screen.getByText('recorder.step.secretNameInvalid')).toBeInTheDocument()
      })

      it('offers no rename when read-only', async () => {
        await renderBlock({ step: secret, onEdit: vi.fn(), readOnly: true })
        expect(
          screen.queryByRole('button', { name: 'recorder.step.secretRename' })
        ).not.toBeInTheDocument()
      })
    })

    it('does not enter edit mode', async () => {
      await renderBlock({ step: watirClick, onEdit: vi.fn() })
      fireEvent.doubleClick(
        screen.getByText('recorder.commandParser.clickElement {"element":"Log in"}')
      )
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
    })
  })

  describe('code view', () => {
    it('shows the Ruby rendered by the main process', async () => {
      await renderBlock({ step: watirClick, showCode: true })
      expect(renderStep).toHaveBeenCalledWith(watirClick)
      expect(await screen.findByText('ruby for c1')).toBeInTheDocument()
    })

    it('shows a short message and stays usable when rendering fails', async () => {
      renderStep.mockRejectedValue(new Error('bad step'))
      const onDelete = vi.fn()
      await renderBlock({ step: watirClick, showCode: true, onDelete, onEdit: vi.fn() })
      expect(await screen.findByText('recorder.step.renderFailed')).toBeInTheDocument()
      fireEvent.doubleClick(screen.getByText('recorder.step.renderFailed'))
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
      fireEvent.click(screen.getByLabelText('Delete step'))
      expect(onDelete).toHaveBeenCalledWith(0)
    })

    it('re-renders when the step changes', async () => {
      const { rerender } = render(<CommandBlock {...baseProps} step={navigate} showCode />)
      expect(await screen.findByText('ruby for n1')).toBeInTheDocument()
      await act(async () => {
        rerender(<CommandBlock {...baseProps} step={watirClick} showCode />)
      })
      expect(await screen.findByText('ruby for c1')).toBeInTheDocument()
    })

    it('calls onDelete with the correct index', async () => {
      const onDelete = vi.fn()
      await renderBlock({ showCode: true, onDelete, index: 2 })
      fireEvent.click(screen.getByLabelText('Delete step'))
      expect(onDelete).toHaveBeenCalledWith(2)
    })
  })

  describe('editing code', () => {
    it('saves edited Ruby as a custom step with the same id (Enter)', async () => {
      const onEdit = vi.fn()
      await renderBlock({ step: watirClick, showCode: true, onEdit, index: 3 })
      await screen.findByText('ruby for c1')

      const textarea = await startEditing('ruby for c1')
      expect(textarea).toHaveValue('ruby for c1')
      fireEvent.change(textarea, { target: { value: '@browser.button(id: "x").click' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onEdit).toHaveBeenCalledWith(3, {
        id: 'c1',
        kind: 'custom',
        code: '@browser.button(id: "x").click'
      })
    })

    it('saves on blur', async () => {
      const onEdit = vi.fn()
      await renderBlock({ showCode: true, onEdit, index: 1 })
      await screen.findByText('ruby for n1')

      const textarea = await startEditing('ruby for n1')
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'puts 1' } })
      })
      await act(async () => {
        fireEvent.blur(textarea)
      })

      expect(onEdit).toHaveBeenCalledWith(1, { id: 'n1', kind: 'custom', code: 'puts 1' })
    })

    it('keeps the step when the rendered text is unchanged', async () => {
      const onEdit = vi.fn()
      await renderBlock({ showCode: true, onEdit })
      await screen.findByText('ruby for n1')

      const textarea = await startEditing('ruby for n1')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onEdit).not.toHaveBeenCalled()
    })

    it('cancels on Escape', async () => {
      const onEdit = vi.fn()
      await renderBlock({ showCode: true, onEdit })
      await screen.findByText('ruby for n1')

      const textarea = await startEditing('ruby for n1')
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'changed' } })
      })
      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'Escape' })
      })

      expect(onEdit).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
      expect(screen.getByText('ruby for n1')).toBeInTheDocument()
    })

    it('does not enter edit mode without onEdit', async () => {
      await renderBlock({ showCode: true })
      await screen.findByText('ruby for n1')
      fireEvent.doubleClick(screen.getByText('ruby for n1'))
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
    })

    it('does not enter edit mode before the Ruby has loaded', async () => {
      renderStep.mockReturnValue(new Promise(() => {}))
      await renderBlock({ showCode: true, onEdit: vi.fn() })
      fireEvent.doubleClick(document.querySelector('.cursor-text')!)
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
    })

    it('disables drag while editing', async () => {
      await renderBlock({ showCode: true, onEdit: vi.fn() })
      await screen.findByText('ruby for n1')

      const textarea = await startEditing('ruby for n1')
      const draggable = textarea.closest('[class*="rounded-lg"]') as HTMLElement
      expect(draggable.getAttribute('draggable')).toBe('false')
    })
  })
})
