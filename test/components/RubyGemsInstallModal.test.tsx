import { render, screen, fireEvent } from '@testing-library/react'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, string>) => opts ? `${key} ${JSON.stringify(opts)}` : key })
}))

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  document.getElementById('root')?.remove()
})

describe('RubyGemsInstallModal', () => {
  const defaultProps = {
    missingGems: ['selenium-webdriver', 'rspec'],
    onInstall: vi.fn(),
    onClose: vi.fn()
  }

  beforeEach(() => vi.clearAllMocks())

  it('renders the title', () => {
    render(<RubyGemsInstallModal {...defaultProps} />)
    expect(screen.getByText('recorder.rubyGemsInstallModal.title')).toBeInTheDocument()
  })

  it('renders a message containing the missing gem names', () => {
    render(<RubyGemsInstallModal {...defaultProps} />)
    expect(screen.getByText(/selenium-webdriver, rspec/)).toBeInTheDocument()
  })

  it('calls onInstall when the Install button is clicked', () => {
    render(<RubyGemsInstallModal {...defaultProps} />)
    fireEvent.click(screen.getByText('recorder.rubyGemsInstallModal.yes'))
    expect(defaultProps.onInstall).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the No button is clicked', () => {
    render(<RubyGemsInstallModal {...defaultProps} />)
    fireEvent.click(screen.getByText('recorder.rubyGemsInstallModal.no'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
