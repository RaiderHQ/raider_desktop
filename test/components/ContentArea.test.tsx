import { render, screen } from '@testing-library/react'
import ContentArea from '@components/ContentArea'
import '@testing-library/jest-dom'

describe('ContentArea', () => {
  it('renders its children', () => {
    render(<ContentArea><p>Content here</p></ContentArea>)
    expect(screen.getByText('Content here')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <ContentArea>
        <span>Alpha</span>
        <span>Beta</span>
      </ContentArea>
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
