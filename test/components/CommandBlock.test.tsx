import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandBlock from '@components/CommandBlock'
import '@testing-library/jest-dom'
import type { Mock } from 'vitest'
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
  return screen.getByLabelText('recorder.step.editCommand')
}

describe('CommandBlock', () => {
  it('shows a tooltip on focus for Record from here', async () => {
    await renderBlock({ isBreakpoint: true, onRecordFromHere: vi.fn() })
    fireEvent.focus(screen.getByRole('button', { name: /recorder.breakpoint.recordFromHere/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.steps.recordFromHere')
  })

  it('has an aria-hidden drag handle with a tooltip', async () => {
    await renderBlock({})
    const handle = screen.getByText('⋮⋮')
    expect(handle).toHaveAttribute('aria-hidden', 'true')
    fireEvent.focus(handle)
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.steps.drag')
  })

  describe('friendly view', () => {
    it('shows the element label of a click, not Ruby', async () => {
      await renderBlock({ step: watirClick })
      expect(
        screen.getByText('recorder.commandParser.clickElement {"element":"Log in"}')
      ).toBeInTheDocument()
      expect(screen.queryByText(/@browser|@driver/)).not.toBeInTheDocument()
      expect(renderStep).not.toHaveBeenCalled()
    })

    describe('found by', () => {
      const withLocator = (locator: NonNullable<Step & { kind: 'click' }>['element']['locator']): Step => ({
        id: 'f',
        kind: 'click',
        element: { strategy: 'css', value: 'button', label: 'Save', locator }
      })

      it('shows how a stable element was found, without the weak icon', async () => {
        await renderBlock({ step: withLocator({ by: 'role', role: 'button', name: 'Save' }) })
        expect(screen.getByTestId('step-found-by')).toHaveTextContent(
          'recorder.foundBy.role {"role":"button","name":"Save"}'
        )
        expect(screen.queryByTestId('step-weak-locator')).not.toBeInTheDocument()
      })

      it('shows a weak icon with text for a weak locator', async () => {
        await renderBlock({ step: withLocator({ by: 'xpath', value: '//a' }) })
        expect(screen.getByTestId('step-found-by')).toHaveTextContent('recorder.foundBy.xpath')
        const weak = screen.getByTestId('step-weak-locator')
        expect(weak).toHaveAttribute('title', 'recorder.foundBy.weak')
        expect(weak).toHaveAttribute('aria-label', 'recorder.foundBy.weak')
      })

      it('shows nothing for steps without an element', async () => {
        await renderBlock({ step: navigate })
        expect(screen.queryByTestId('step-found-by')).not.toBeInTheDocument()
      })

      it('is hidden in the code view', async () => {
        await renderBlock({ step: withLocator({ by: 'xpath', value: '//a' }), showCode: true })
        expect(screen.queryByTestId('step-found-by')).not.toBeInTheDocument()
      })
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
      const rename = async (
        onEdit: Mock<(index: number, step: Step) => void>,
        value: string
      ): Promise<void> => {
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
        await rename(onEdit, 'RAIDER_SECRET_ADMIN')
        expect(onEdit).toHaveBeenCalledWith(0, { ...secret, secretName: 'RAIDER_SECRET_ADMIN' })
      })

      it.each(['admin password', 'GITHUB_TOKEN', 'RAIDER_TOKEN', 'RAIDER_SECRET'])(
        'refuses %j, which is not a RAIDER_SECRET_ variable',
        async (name) => {
          const onEdit = vi.fn()
          await rename(onEdit, name)
          expect(onEdit).not.toHaveBeenCalled()
          expect(screen.getByText('recorder.step.secretNameInvalid')).toBeInTheDocument()
        }
      )

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

    describe('flow inputs', () => {
      const hours: Step = {
        id: 'h',
        kind: 'type',
        element: { strategy: 'id', value: 'hours', label: 'Hours' },
        text: '8'
      }
      const useAs = 'recorder.step.useAsInput'
      const nameField = (): HTMLElement =>
        screen.getByLabelText('recorder.step.inputModal.nameLabel')
      const save = (): HTMLElement =>
        screen.getByRole('button', { name: 'recorder.step.inputModal.save' })

      it('offers "Use as input…" on a typing step of a flow only', async () => {
        await renderBlock({ step: hours, onEdit: vi.fn(), canUseInputs: true })
        expect(screen.getByRole('button', { name: useAs })).toBeInTheDocument()
      })

      it.each([
        ['a test', hours, {}],
        ['a read-only flow', hours, { canUseInputs: true, readOnly: true }],
        ['a click step', watirClick, { canUseInputs: true }],
        [
          'a secret step',
          { ...hours, text: '', secret: true, secretName: 'RAIDER_SECRET_1' } as Step,
          { canUseInputs: true }
        ]
      ])('offers no input on %s', async (_what, step, extra) => {
        await renderBlock({ step, onEdit: vi.fn(), ...extra })
        expect(screen.queryByRole('button', { name: useAs })).toBeNull()
      })

      it('validates the name live and saves it on the step', async () => {
        const onEdit = vi.fn()
        await renderBlock({ step: hours, onEdit, canUseInputs: true })
        fireEvent.click(screen.getByRole('button', { name: useAs }))

        expect(screen.getByRole('dialog')).toHaveTextContent('recorder.step.inputModal.titleNew')
        // The default is the recorded text, shown but not editable
        expect(screen.getByTestId('input-default')).toHaveTextContent('8')
        expect(screen.getByText('recorder.step.inputModal.defaultHelp')).toBeInTheDocument()
        expect(save()).toBeDisabled()

        for (const bad of ['Hours', '1st', 'my hours', 'a'.repeat(41), '_x']) {
          fireEvent.change(nameField(), { target: { value: bad } })
          expect(save()).toBeDisabled()
          expect(screen.getByText('recorder.step.inputModal.nameInvalid')).toBeInTheDocument()
        }
        fireEvent.keyDown(nameField(), { key: 'Enter' })
        expect(onEdit).not.toHaveBeenCalled()

        fireEvent.change(nameField(), { target: { value: 'hours_2' } })
        expect(screen.queryByText('recorder.step.inputModal.nameInvalid')).toBeNull()
        expect(save()).toBeEnabled()
        fireEvent.click(save())
        expect(onEdit).toHaveBeenCalledWith(0, { ...hours, inputName: 'hours_2' })
        expect(screen.queryByRole('dialog')).toBeNull()
      })

      it('saves with Enter and closes on Cancel without saving', async () => {
        const onEdit = vi.fn()
        await renderBlock({ step: hours, onEdit, canUseInputs: true })
        fireEvent.click(screen.getByRole('button', { name: useAs }))
        fireEvent.click(screen.getByRole('button', { name: 'recorder.step.inputModal.cancel' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(onEdit).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: useAs }))
        fireEvent.change(nameField(), { target: { value: 'hours' } })
        fireEvent.keyDown(nameField(), { key: 'Enter' })
        expect(onEdit).toHaveBeenCalledWith(0, { ...hours, inputName: 'hours' })
      })

      it('shows the input in the label, and changes or stops it', async () => {
        const onEdit = vi.fn()
        const input = { ...hours, inputName: 'hours' }
        await renderBlock({ step: input, onEdit, canUseInputs: true })
        expect(
          screen.getByText(
            'recorder.commandParser.typeTextInput {"element":"Hours","text":"8","name":"hours"}'
          )
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: useAs })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'recorder.step.changeInput' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('recorder.step.inputModal.titleChange')
        expect(nameField()).toHaveValue('hours')
        fireEvent.change(nameField(), { target: { value: 'days' } })
        fireEvent.click(save())
        expect(onEdit).toHaveBeenLastCalledWith(0, { ...hours, inputName: 'days' })

        fireEvent.click(screen.getByRole('button', { name: 'recorder.step.stopInput' }))
        const stopped = onEdit.mock.lastCall![1]
        expect(stopped).toEqual(hours)
        expect(stopped).not.toHaveProperty('inputName')
      })
    })

    it('does not enter edit mode', async () => {
      await renderBlock({ step: watirClick, onEdit: vi.fn() })
      fireEvent.doubleClick(
        screen.getByText('recorder.commandParser.clickElement {"element":"Log in"}')
      )
      expect(screen.queryByLabelText('recorder.step.editCommand')).not.toBeInTheDocument()
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
      expect(screen.queryByLabelText('recorder.step.editCommand')).not.toBeInTheDocument()
      fireEvent.click(screen.getByLabelText('recorder.step.delete'))
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
      fireEvent.click(screen.getByLabelText('recorder.step.delete'))
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
      expect(screen.queryByLabelText('recorder.step.editCommand')).not.toBeInTheDocument()
      expect(screen.getByText('ruby for n1')).toBeInTheDocument()
    })

    it('does not enter edit mode without onEdit', async () => {
      await renderBlock({ showCode: true })
      await screen.findByText('ruby for n1')
      fireEvent.doubleClick(screen.getByText('ruby for n1'))
      expect(screen.queryByLabelText('recorder.step.editCommand')).not.toBeInTheDocument()
    })

    it('does not enter edit mode before the Ruby has loaded', async () => {
      renderStep.mockReturnValue(new Promise(() => {}))
      await renderBlock({ showCode: true, onEdit: vi.fn() })
      fireEvent.doubleClick(document.querySelector('.cursor-text')!)
      expect(screen.queryByLabelText('recorder.step.editCommand')).not.toBeInTheDocument()
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
