import { render, screen, fireEvent } from '@testing-library/react'
import ProjectSelector from '@components/ProjectSelector'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// InformationModal uses ReactDOM.createPortal into #root
beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  document.getElementById('root')?.remove()
})

const defaultProps = {
  icon: '',
  description: 'Open a project',
  buttonValue: 'Open',
  modalTitleKey: 'modal.title',
  modalMessageKey: 'modal.message'
}

describe('ProjectSelector', () => {
  it("the card's info modal links to docs.projects", () => {
    const openDocs = vi.fn().mockResolvedValue({ success: true })
    // @ts-expect-error - Mocking window.api
    window.api = { openDocs }
    render(<MemoryRouter><ProjectSelector {...defaultProps} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByText('docs.learnMore'))
    expect(openDocs).toHaveBeenCalledWith('docs.projects')
  })

  it('renders the description', () => {
    render(<MemoryRouter><ProjectSelector {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('Open a project')).toBeInTheDocument()
  })

  it('shows its tooltip on the button and the help button on focus', () => {
    render(
      <MemoryRouter>
        <ProjectSelector {...defaultProps} tooltip="Hello" />
      </MemoryRouter>
    )
    fireEvent.focus(screen.getByText('Open'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
    fireEvent.blur(screen.getByText('Open'))
    fireEvent.focus(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
  })

  it('renders the button', () => {
    render(<MemoryRouter><ProjectSelector {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('opens the information modal when ? icon is clicked', () => {
    render(<MemoryRouter><ProjectSelector {...defaultProps} /></MemoryRouter>)
    fireEvent.click(screen.getByLabelText('Help'))
    expect(screen.getByText('modal.title')).toBeInTheDocument()
    expect(screen.getByText('modal.message')).toBeInTheDocument()
  })

  it('renders a Link when url is provided', () => {
    render(
      <MemoryRouter>
        <ProjectSelector {...defaultProps} url="/new" />
      </MemoryRouter>
    )
    // The button text should be wrapped in an anchor
    expect(screen.getByText('Open').closest('a')).toHaveAttribute('href', '/new')
  })

  it('calls onClick when no url and button is clicked', () => {
    const onClick = vi.fn()
    render(<MemoryRouter><ProjectSelector {...defaultProps} onClick={onClick} /></MemoryRouter>)
    fireEvent.click(screen.getByText('Open'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
