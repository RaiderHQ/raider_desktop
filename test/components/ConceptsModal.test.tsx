import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import ConceptsModal from '@components/ConceptsModal'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

describe('ConceptsModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('the footer link opens docs.home', () => {
    const openDocs = vi.fn().mockResolvedValue({ success: true })
    ;(window as unknown as Record<string, unknown>).api = { openDocs }
    render(<ConceptsModal onClose={vi.fn()} onOpenShortcuts={vi.fn()} />)
    fireEvent.click(screen.getByText('docs.learnMore'))
    expect(openDocs).toHaveBeenCalledWith('docs.home')
  })
})
