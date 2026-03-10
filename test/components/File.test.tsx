import { render, screen, fireEvent } from '@testing-library/react'
import File from '@components/Library/File'
import '@testing-library/jest-dom'

describe('File', () => {
  it('renders the file name', () => {
    render(<File name="test_spec.rb" path="/some/path/test_spec.rb" onFileClick={vi.fn()} />)
    expect(screen.getByText('test_spec.rb')).toBeInTheDocument()
  })

  it('calls onFileClick with the file path when clicked', () => {
    const onFileClick = vi.fn()
    render(<File name="test_spec.rb" path="/some/path/test_spec.rb" onFileClick={onFileClick} />)
    fireEvent.click(screen.getByText('test_spec.rb'))
    expect(onFileClick).toHaveBeenCalledWith('/some/path/test_spec.rb')
  })
})
