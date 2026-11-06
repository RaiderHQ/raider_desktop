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

  it('marks only the dirty file', () => {
    render(
      <>
        <File name="a_spec.rb" path="/p/a_spec.rb" dirtyPath="/p/a_spec.rb" onFileClick={vi.fn()} />
        <File name="b_spec.rb" path="/p/b_spec.rb" dirtyPath="/p/a_spec.rb" onFileClick={vi.fn()} />
      </>
    )
    const a = screen.getByText('a_spec.rb').parentElement as HTMLElement
    const b = screen.getByText('b_spec.rb').parentElement as HTMLElement
    expect(a).toHaveAttribute('aria-label', expect.stringContaining('files.unsavedSuffix'))
    expect(a.textContent).toContain('•')
    expect(b).not.toHaveAttribute('aria-label')
    expect(b.textContent).not.toContain('•')
  })
})
