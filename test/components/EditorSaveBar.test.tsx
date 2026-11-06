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

  it('keeps Save off while a save is in flight', () => {
    render(<EditorSaveBar fileName="a.rb" dirty saving onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'editor.saveButton' })).toBeDisabled()
  })
})
