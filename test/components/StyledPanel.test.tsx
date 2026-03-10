import { render, screen } from '@testing-library/react'
import StyledPanel from '@components/StyledPanel'
import '@testing-library/jest-dom'

describe('StyledPanel', () => {
  it('renders its children', () => {
    render(<StyledPanel><p>Panel content</p></StyledPanel>)
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <StyledPanel>
        <span>First</span>
        <span>Second</span>
      </StyledPanel>
    )
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})
