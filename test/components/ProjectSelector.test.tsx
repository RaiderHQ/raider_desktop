import { render, screen, fireEvent } from '@testing-library/react'
import ProjectSelector from '@components/ProjectSelector'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

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
  it('renders the description', () => {
    render(<MemoryRouter><ProjectSelector {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('Open a project')).toBeInTheDocument()
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
