import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import UnsavedChangesModal from '@components/UnsavedChangesModal'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, o?: object) => string } => ({
    t: (key: string, o?: object): string => (o ? `${key} ${JSON.stringify(o)}` : key)
  })
}))

describe('UnsavedChangesModal', () => {
  const renderModal = (): {
    onSave: ReturnType<typeof vi.fn>
    onDiscard: ReturnType<typeof vi.fn>
    onCancel: ReturnType<typeof vi.fn>
  } => {
    const handlers = { onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() }
    render(<UnsavedChangesModal fileName="login_page_spec.rb" {...handlers} />)
    return handlers
  }

  it('asks about the file by name', () => {
    renderModal()
    expect(
      screen.getByRole('dialog', { name: 'editor.unsaved.title {"fileName":"login_page_spec.rb"}' })
    ).toBeInTheDocument()
  })

  it("offers Save, Don't save and Cancel", () => {
    const { onSave, onDiscard, onCancel } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
    fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.cancel' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
