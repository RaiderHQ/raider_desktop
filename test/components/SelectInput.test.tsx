import { render, screen, fireEvent } from '@testing-library/react'
import SelectInput from '@components/SelectInput'
import '@testing-library/jest-dom'

describe('SelectInput', () => {
  const options = ['Chrome', 'Firefox', 'Safari']

  it('renders the label', () => {
    render(
      <SelectInput label="Browser" options={options} selected="Chrome" onChange={vi.fn()} />
    )
    expect(screen.getByText('Browser')).toBeInTheDocument()
  })

  it('renders all options', () => {
    render(
      <SelectInput label="Browser" options={options} selected="Chrome" onChange={vi.fn()} />
    )
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.getByText('Firefox')).toBeInTheDocument()
    expect(screen.getByText('Safari')).toBeInTheDocument()
  })

  it('reflects the selected value', () => {
    render(
      <SelectInput label="Browser" options={options} selected="Firefox" onChange={vi.fn()} />
    )
    expect(screen.getByRole('combobox')).toHaveValue('Firefox')
  })

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn()
    render(
      <SelectInput label="Browser" options={options} selected="Chrome" onChange={onChange} />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Safari' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
