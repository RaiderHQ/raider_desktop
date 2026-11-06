import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import Checkbox from '@components/Checkbox'
import SegmentedControl from '@components/SegmentedControl'
import TagInput from '@components/TagInput'

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' }
]

describe('form component tooltips', () => {
  it('Checkbox shows its tooltip on focus', () => {
    const { unmount } = render(
      <Checkbox label="X" checked={false} onChange={vi.fn()} tooltip="Hello" />
    )
    fireEvent.focus(screen.getByLabelText('X'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
    unmount()
    render(<Checkbox label="X" checked={false} onChange={vi.fn()} />)
    fireEvent.focus(screen.getByLabelText('X'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('SegmentedControl shows its tooltip when an option takes focus', () => {
    const { unmount } = render(
      <SegmentedControl label="X" options={options} value="a" onChange={vi.fn()} tooltip="Hello" />
    )
    fireEvent.focus(screen.getAllByRole('radio')[0])
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
    unmount()
    render(<SegmentedControl label="X" options={options} value="a" onChange={vi.fn()} />)
    fireEvent.focus(screen.getAllByRole('radio')[0])
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('TagInput shows its tooltip on focus', () => {
    const { unmount } = render(<TagInput tags={[]} onChange={vi.fn()} tooltip="Hello" />)
    fireEvent.focus(screen.getByRole('textbox'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
    unmount()
    render(<TagInput tags={[]} onChange={vi.fn()} />)
    fireEvent.focus(screen.getByRole('textbox'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
