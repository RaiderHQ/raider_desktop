import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import ShortcutsSheet from '@components/ShortcutsSheet'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

const setPlatform = (value: string): void => {
  Object.defineProperty(navigator, 'platform', { value, configurable: true })
}

describe('ShortcutsSheet', () => {
  afterEach(() => setPlatform('MacIntel'))

  it('lists every shortcut with its platform label', () => {
    setPlatform('MacIntel')
    const { unmount } = render(<ShortcutsSheet onClose={vi.fn()} />)
    expect(screen.getAllByRole('row')).toHaveLength(12) // header + eleven
    expect(screen.getByRole('columnheader', { name: 'shortcuts.action' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'shortcuts.key' })).toBeInTheDocument()
    const save = screen.getByText('shortcuts.actions.save').closest('tr') as HTMLElement
    expect(within(save).getByText('⌘S')).toBeInTheDocument()
    const docs = screen.getByText('shortcuts.actions.docs').closest('tr') as HTMLElement
    expect(within(docs).getByText('—')).toBeInTheDocument()
    unmount()
    setPlatform('Win32')
    render(<ShortcutsSheet onClose={vi.fn()} />)
    const winSave = screen.getByText('shortcuts.actions.save').closest('tr') as HTMLElement
    expect(within(winSave).getByText('Ctrl+S')).toBeInTheDocument()
  })

  it('is a dialog named by its title, with Close focused', () => {
    render(<ShortcutsSheet onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'shortcuts.title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shortcuts.close' })).toHaveFocus()
  })

  it('Esc closes', () => {
    const onClose = vi.fn()
    render(<ShortcutsSheet onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Tab stays inside', () => {
    render(<ShortcutsSheet onClose={vi.fn()} />)
    const close = screen.getByRole('button', { name: 'shortcuts.close' })
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(false)
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(close).toHaveFocus()
  })
})
