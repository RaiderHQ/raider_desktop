import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect } from 'vitest'
import EditValueForm from '@components/FailedStepPanel/EditValueForm'
import type { Step } from '@shared/types/step'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, v?: Record<string, string>) => string } => ({
    t: (key, v) => (v ? `${key} ${Object.values(v).join(',')}` : key)
  })
}))

const el = { strategy: 'css' as const, value: '#x' }
const assertText: Step = {
  id: 'a',
  kind: 'assert',
  check: 'textEquals',
  element: el,
  expected: 'Hi'
}

describe('EditValueForm', () => {
  it('starts with the current value and saves the edited step', () => {
    const onSave = vi.fn()
    render(<EditValueForm step={assertText} onSave={onSave} onCancel={vi.fn()} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('Hi')
    fireEvent.change(input, { target: { value: 'Bye' } })
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    expect(onSave).toHaveBeenCalledWith({ ...assertText, expected: 'Bye' })
  })

  it('offers what the page showed for a check', () => {
    const onSave = vi.fn()
    render(
      <EditValueForm step={assertText} actualValue="Hello" onSave={onSave} onCancel={vi.fn()} />
    )
    expect(screen.getByText('failedStep.pageShowed Hello')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.useThis' }))
    expect(screen.getByRole('textbox')).toHaveValue('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'failedStep.save' }))
    expect(onSave).toHaveBeenCalledWith({ ...assertText, expected: 'Hello' })
  })

  it('does not offer the page value for a step that is not a check', () => {
    const typeStep: Step = { id: 't', kind: 'type', element: el, text: 'a' }
    render(
      <EditValueForm step={typeStep} actualValue="Hello" onSave={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'failedStep.useThis' })).not.toBeInTheDocument()
  })

  it('cancels', () => {
    const onCancel = vi.fn()
    render(<EditValueForm step={assertText} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('just closes when nothing changed', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<EditValueForm step={assertText} onSave={onSave} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onCancel).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
