import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect } from 'vitest'
import FileNameDialog from '@components/FileNameDialog'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, o?: object) => string } => ({
    t: (key: string, o?: object): string => (o ? `${key} ${JSON.stringify(o)}` : key)
  })
}))

const setup = (
  props: Partial<React.ComponentProps<typeof FileNameDialog>> = {}
): {
  onSubmit: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
} => {
  const onSubmit = vi.fn().mockResolvedValue(null)
  const onCancel = vi.fn()
  render(
    <FileNameDialog
      title="files.newFile.title"
      confirmLabel="files.newFile.confirm"
      taken={['Gemfile']}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />
  )
  return { onSubmit, onCancel }
}

const type = (value: string): void => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

describe('FileNameDialog', () => {
  it('is a named dialog with the name field focused', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'files.newFile.title' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it.each([
    ['', 'files.name.empty'],
    ['a/b', 'files.name.invalid'],
    ['..', 'files.name.invalid'],
    ['Gemfile', 'files.name.taken']
  ])('keeps the dialog open and says why %j is refused', async (name, key) => {
    const { onSubmit } = setup()
    type(name)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(key)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('submits the trimmed name with Enter', async () => {
    const { onSubmit } = setup()
    type('  new_spec.rb ')
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    })
    expect(onSubmit).toHaveBeenCalledWith('new_spec.rb')
  })

  it('shows an error the submit returns', async () => {
    const { onSubmit } = setup()
    onSubmit.mockResolvedValueOnce('That name is taken')
    type('x.rb')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('That name is taken')
  })

  it('starts from the given name and cancels with Escape', () => {
    const { onCancel } = setup({ initialValue: 'login_spec.rb' })
    expect(screen.getByRole('textbox')).toHaveValue('login_spec.rb')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('accepts the unchanged name when renaming', async () => {
    const { onSubmit } = setup({ initialValue: 'Gemfile' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(onSubmit).toHaveBeenCalledWith('Gemfile')
  })

  it('closes with Escape wherever the focus is in the dialog', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(screen.getByRole('button', { name: 'files.newFile.confirm' }), {
      key: 'Escape'
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('selects the part of the name to change first', () => {
    setup({ initialValue: 'login_spec.rb', selectEnd: 10 })
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 10])
  })

  it('says why Windows-hostile and protected names are refused', async () => {
    const { onSubmit } = setup()
    for (const [name, key] of [
      ['a:b', 'files.name.characters'],
      ['CON', 'files.name.reserved'],
      ['x.', 'files.name.trailing'],
      ['.git', 'files.name.protected']
    ]) {
      type(name)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
      })
      expect(screen.getByRole('alert')).toHaveTextContent(key)
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets a rename change only the case of the name', async () => {
    const { onSubmit } = setup({ initialValue: 'login.rb', taken: ['login.rb', 'Gemfile'] })
    type('Login.rb')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(onSubmit).toHaveBeenCalledWith('Login.rb')
  })

  it('takes another rule for the name in place of the file name rule', async () => {
    const validate = vi.fn((name: string) => (name.includes('-') ? 'no dashes' : null))
    const { onSubmit } = setup({ validate, taken: [] })
    type('check-out')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('no dashes')
    expect(onSubmit).not.toHaveBeenCalled()
    // A name the file rule refuses is fine when the other rule allows it
    type('Gemfile')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(onSubmit).toHaveBeenCalledWith('Gemfile')
    expect(validate).toHaveBeenLastCalledWith('Gemfile')
  })

  it('shows what the name will make, tied to the field, until there is an error', async () => {
    setup({
      preview: (name) => (name ? `Creates ${name}_page.rb` : null),
      validate: (name) => (name === 'bad' ? 'refused' : null)
    })
    expect(screen.queryByText(/Creates/)).not.toBeInTheDocument()
    type('checkout')
    const hint = screen.getByText('Creates checkout_page.rb')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', hint.id)
    type('bad')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'files.newFile.confirm' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('refused')
    expect(screen.queryByText(/Creates/)).not.toBeInTheDocument()
  })
})
