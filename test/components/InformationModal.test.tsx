import { render, screen, fireEvent } from '@testing-library/react'
import InformationModal from '@components/InformationModal'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// createPortal renders into #root — provide it in the DOM
beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  document.getElementById('root')?.remove()
})

describe('InformationModal', () => {
  it('renders the title and message', () => {
    render(
      <InformationModal title="Hello Title" message="Hello message" onClose={vi.fn()} />
    )
    expect(screen.getByText('Hello Title')).toBeInTheDocument()
    expect(screen.getByText('Hello message')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    // The overlay has id="modal-overlay"
    const overlay = document.getElementById('modal-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the modal content is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    fireEvent.click(screen.getByText('M'))
    expect(onClose).not.toHaveBeenCalled()
  })

  describe('collapsible sections', () => {
    const sections = [
      { titleKey: 'section.one.title', contentKey: 'section.one.content' },
      { titleKey: 'section.two.title', contentKey: 'section.two.content' }
    ]

    it('renders without collapsible sections (existing behavior)', () => {
      render(<InformationModal title="T" message="M" onClose={vi.fn()} />)
      expect(screen.getByText('T')).toBeInTheDocument()
      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.queryByText('section.one.title')).not.toBeInTheDocument()
    })

    it('renders collapsible section titles when provided', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      expect(screen.getByText('section.one.title')).toBeInTheDocument()
      expect(screen.getByText('section.two.title')).toBeInTheDocument()
    })

    it('section content is not visible by default (collapsed)', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      expect(screen.queryByText('section.one.content')).not.toBeInTheDocument()
      expect(screen.queryByText('section.two.content')).not.toBeInTheDocument()
    })

    it('clicking a section title expands it and shows content', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      fireEvent.click(screen.getByText('section.one.title'))
      expect(screen.getByText('section.one.content')).toBeInTheDocument()
    })

    it('clicking an expanded section collapses it', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      fireEvent.click(screen.getByText('section.one.title'))
      expect(screen.getByText('section.one.content')).toBeInTheDocument()

      fireEvent.click(screen.getByText('section.one.title'))
      expect(screen.queryByText('section.one.content')).not.toBeInTheDocument()
    })

    it('only one section can be open at a time', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      fireEvent.click(screen.getByText('section.one.title'))
      expect(screen.getByText('section.one.content')).toBeInTheDocument()

      fireEvent.click(screen.getByText('section.two.title'))
      expect(screen.queryByText('section.one.content')).not.toBeInTheDocument()
      expect(screen.getByText('section.two.content')).toBeInTheDocument()
    })

    it('the chevron rotates when a section is expanded', () => {
      render(
        <InformationModal
          title="T"
          message="M"
          onClose={vi.fn()}
          collapsibleSections={sections}
        />
      )
      // The chevron svg is inside the button next to the title text
      const sectionButton = screen.getByText('section.one.title').closest('button')!
      const chevron = sectionButton.querySelector('svg')!

      expect(chevron.classList.contains('rotate-180')).toBe(false)

      fireEvent.click(sectionButton)
      expect(chevron.classList.contains('rotate-180')).toBe(true)

      fireEvent.click(sectionButton)
      expect(chevron.classList.contains('rotate-180')).toBe(false)
    })
  })
})
