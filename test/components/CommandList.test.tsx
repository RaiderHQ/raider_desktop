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

  it('names each secret step by the variable stored on it, whatever the order', async () => {
    const pw = { strategy: 'id' as const, value: 'pw', label: 'Password' }
    const secrets: Step[] = [
      {
        id: 's2',
        kind: 'type',
        element: pw,
        text: '',
        secret: true,
        secretName: 'RAIDER_SECRET_1'
      },
      { id: 's1', kind: 'type', element: pw, text: '', secret: true, secretName: 'RAIDER_SECRET_2' }
    ]
    render(
      <CommandList steps={secrets} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode={false} />
    )
    expect(
      screen.getByText(
        'recorder.commandParser.typeSecret {"element":"Password","name":"RAIDER_SECRET_1"}'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'recorder.commandParser.typeSecret {"element":"Password","name":"RAIDER_SECRET_2"}'
      )
    ).toBeInTheDocument()

    await act(async () => {
      render(<CommandList steps={secrets} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode />)
    })
    expect(window.api.renderStep).toHaveBeenCalledWith(secrets[1])
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
    fireEvent.click(screen.getByLabelText('recorder.step.delete'))
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
    const textarea = screen.getByLabelText('recorder.step.editCommand')
    fireEvent.change(textarea, { target: { value: 'puts 2' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onEditStep).toHaveBeenCalledWith(1, { id: 'b', kind: 'custom', code: 'puts 2' })
  })

  it('marks the failed step, scrolls it into view once, and renders below a step', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = render(
      <CommandList
        steps={steps}
        setSteps={vi.fn()}
        onDeleteStep={vi.fn()}
        showCode={false}
        failedIndex={1}
        belowStep={(i) => (i === 1 ? <p>under b</p> : null)}
      />
    )
    const failed = screen.getAllByTestId('step-failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toHaveTextContent('recorder.commandParser.visit {"url":"b"}')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(screen.getByText('under b')).toBeInTheDocument()
    rerender(
      <CommandList
        steps={steps}
        setSteps={vi.fn()}
        onDeleteStep={vi.fn()}
        showCode={false}
        failedIndex={1}
      />
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('marks no step without a failed index', () => {
    render(<CommandList steps={steps} setSteps={vi.fn()} onDeleteStep={vi.fn()} showCode={false} />)
    expect(screen.queryByTestId('step-failed')).toBeNull()
  })

  it('shows only the failed highlight on a step that is also the latest', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <CommandList
        steps={steps}
        setSteps={vi.fn()}
        onDeleteStep={vi.fn()}
        showCode={false}
        markLatest
        failedIndex={1}
      />
    )
    const block = screen.getByTestId('step-failed')
    expect(block).toHaveClass('ring-red-400')
    expect(block).not.toHaveClass('ring-ruby/40')
  })
})
