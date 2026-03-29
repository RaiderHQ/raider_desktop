import { render, screen, fireEvent } from '@testing-library/react'
import RubyInstallModal from '@components/RubyInstallModal'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  document.getElementById('root')?.remove()
})

describe('RubyInstallModal', () => {
  it('renders the title and message', () => {
    render(<RubyInstallModal onClose={vi.fn()} onCloseApp={vi.fn()} />)
    expect(screen.getByText('recorder.rubyInstallModal.title')).toBeInTheDocument()
    expect(screen.getByText('recorder.rubyInstallModal.message')).toBeInTheDocument()
  })

  it('calls onClose when Continue is clicked', () => {
    const onClose = vi.fn()
    render(<RubyInstallModal onClose={onClose} onCloseApp={vi.fn()} />)
    fireEvent.click(screen.getByText('recorder.rubyInstallModal.continue'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCloseApp when Close App is clicked', () => {
    const onCloseApp = vi.fn()
    render(<RubyInstallModal onClose={vi.fn()} onCloseApp={onCloseApp} />)
    fireEvent.click(screen.getByText('recorder.rubyInstallModal.close'))
    expect(onCloseApp).toHaveBeenCalledTimes(1)
  })
})
