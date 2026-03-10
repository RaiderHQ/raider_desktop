import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandList from '@components/CommandList'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// CommandBlock internally calls window.api
beforeEach(() => {
  window.api = {
    commandParser: vi.fn().mockResolvedValue('Friendly description'),
    xpathParser: vi.fn().mockResolvedValue('XPath description')
  } as any
})

describe('CommandList', () => {
  it('renders empty state placeholder when no steps', () => {
    render(<CommandList steps={[]} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode={true} />)
    expect(screen.getByText('recorder.placeholder.commands')).toBeInTheDocument()
  })

  it('renders a block for each step', async () => {
    await act(async () => {
      render(
        <CommandList
          steps={['@driver.get("a")', '@driver.get("b")']}
          setSteps={vi.fn()}
          onDeleteStep={vi.fn()}
          showCode={true}
        />
      )
    })
    expect(screen.getByText('@driver.get("a")')).toBeInTheDocument()
    expect(screen.getByText('@driver.get("b")')).toBeInTheDocument()
  })

  it('calls onDeleteStep when a step delete button is clicked', async () => {
    const onDeleteStep = vi.fn()
    await act(async () => {
      render(
        <CommandList
          steps={['step one']}
          setSteps={vi.fn()}
          onDeleteStep={onDeleteStep}
          showCode={true}
        />
      )
    })
    fireEvent.click(screen.getByLabelText('Delete step'))
    expect(onDeleteStep).toHaveBeenCalledWith(0)
  })
})
