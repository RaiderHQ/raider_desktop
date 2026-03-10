import { render, screen } from '@testing-library/react'
import NoProjectLoadedMessage from '@components/NoProjectLoadedMessage'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('NoProjectLoadedMessage', () => {
  it('renders the title', () => {
    render(<NoProjectLoadedMessage />)
    expect(screen.getByText('settings.noProject.title')).toBeInTheDocument()
  })

  it('renders the description', () => {
    render(<NoProjectLoadedMessage />)
    expect(screen.getByText('settings.noProject.description')).toBeInTheDocument()
  })
})
