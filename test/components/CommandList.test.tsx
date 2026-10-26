import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandList from '@components/CommandList'
import '@testing-library/jest-dom'
import type { Step } from '@shared/types/step'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vals?: Record<string, string>) =>
      vals && Object.keys(vals).length ? `${key} ${JSON.stringify(vals)}` : key
  })
}))

// CommandBlock asks the main process for the Ruby of each step in code view
beforeEach(() => {
  window.api = {
    renderStep: vi.fn(async (step: Step) => (step.kind === 'navigate' ? `goto ${step.url}` : ''))
  } as any
})

const steps: Step[] = [
  { id: 'a', kind: 'navigate', url: 'a' },
  { id: 'b', kind: 'navigate', url: 'b' }
]

describe('CommandList', () => {
  it('renders empty state placeholder when no steps', () => {
    render(<CommandList steps={[]} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode={true} />)
    expect(screen.getByText('recorder.placeholder.commands')).toBeInTheDocument()
  })

  it('renders the Ruby of each step in code view', async () => {
    await act(async () => {
      render(<CommandList steps={steps} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode />)
    })
    expect(await screen.findByText('goto a')).toBeInTheDocument()
    expect(screen.getByText('goto b')).toBeInTheDocument()
  })

  it('renders a description of each step in friendly view', () => {
    render(<CommandList steps={steps} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode={false} />)
    expect(screen.getByText('recorder.commandParser.visit {"url":"a"}')).toBeInTheDocument()
    expect(screen.getByText('recorder.commandParser.visit {"url":"b"}')).toBeInTheDocument()
  })

  it('calls onDeleteStep when a step delete button is clicked', () => {
    const onDeleteStep = vi.fn()
    render(
      <CommandList
        steps={[steps[0]]}
        setSteps={vi.fn()}
        onDeleteStep={onDeleteStep}
        showCode={false}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete step'))
    expect(onDeleteStep).toHaveBeenCalledWith(0)
  })

  it('passes edited steps up with their index', async () => {
    const onEditStep = vi.fn()
    await act(async () => {
      render(
        <CommandList
          steps={steps}
          setSteps={vi.fn()}
          onDeleteStep={vi.fn()}
          onEditStep={onEditStep}
          showCode
        />
      )
    })
    await act(async () => {
      fireEvent.doubleClick((await screen.findByText('goto b')).closest('.cursor-text')!)
    })
    const textarea = screen.getByLabelText('Edit command')
    fireEvent.change(textarea, { target: { value: 'puts 2' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onEditStep).toHaveBeenCalledWith(1, { id: 'b', kind: 'custom', code: 'puts 2' })
  })
})
