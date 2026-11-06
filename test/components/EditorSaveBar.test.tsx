import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import EditorSaveBar from '@components/EditorSaveBar'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

describe('EditorSaveBar', () => {
  it('shows the file as saved with Save off when there is nothing to save', () => {
    render(<EditorSaveBar fileName="a.rb" dirty={false} saving={false} onSave={vi.fn()} />)
    expect(screen.getByText('a.rb')).toBeInTheDocument()
    expect(screen.getByText('editor.status.saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'editor.saveButton' })).toBeDisabled()
  })

  it('shows unsaved changes and saves on click', () => {
    const onSave = vi.fn()
    render(<EditorSaveBar fileName="a.rb" dirty saving={false} onSave={onSave} />)
    expect(screen.getByText('editor.status.unsaved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'editor.saveButton' }))
    expect(onSave).toHaveBeenCalled()
  })

  it('the Save button names its shortcut', () => {
    render(<EditorSaveBar fileName="a.rb" dirty saving={false} onSave={vi.fn()} />)
    fireEvent.focus(screen.getByRole('button', { name: 'editor.saveButton' }))
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('tooltips.editor.save')
    expect(tip.querySelector('kbd')).not.toBeNull()
  })

  it('names the shortcut in the button', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
    const setPlatform = (value: string): void => {
      Object.defineProperty(window.navigator, 'platform', { value, configurable: true })
    }
    try {
      setPlatform('MacIntel')
      const { container, unmount } = render(
        <EditorSaveBar fileName="a.rb" dirty saving={false} onSave={vi.fn()} />
      )
      expect(container.querySelector('button kbd')).toHaveTextContent('⌘S')
      expect(container.querySelector('button kbd')).toHaveAttribute('aria-hidden', 'true')
      unmount()
      setPlatform('Win32')
      const win = render(<EditorSaveBar fileName="a.rb" dirty saving={false} onSave={vi.fn()} />)
      expect(win.container.querySelector('button kbd')).toHaveTextContent('Ctrl+S')
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original)
    }
  })

  it('keeps Save off while a save is in flight', () => {
    render(<EditorSaveBar fileName="a.rb" dirty saving onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'editor.saveButton' })).toBeDisabled()
  })
})
