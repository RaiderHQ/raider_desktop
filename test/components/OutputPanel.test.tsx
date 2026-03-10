import { render, screen } from '@testing-library/react'
import OutputPanel from '@components/OutputPanel'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const rspecJson = JSON.stringify({
  summary: { duration: 1.5, example_count: 2, failure_count: 1, pending_count: 0 },
  summary_line: '2 examples, 1 failure',
  examples: [
    { description: 'does something', status: 'passed', exception: null },
    { description: 'fails here', status: 'failed', exception: { message: 'expected true' } }
  ]
})

describe('OutputPanel', () => {
  it('renders placeholder when output is empty', () => {
    render(<OutputPanel output="" />)
    expect(screen.getByText('recorder.outputPanel.placeholder')).toBeInTheDocument()
  })

  it('renders raw text when output is not JSON', () => {
    render(<OutputPanel output="plain text output" />)
    expect(screen.getByText('plain text output')).toBeInTheDocument()
  })

  it('formats valid RSpec JSON output', () => {
    render(<OutputPanel output={rspecJson} />)
    expect(screen.getByText(/does something: PASSED/)).toBeInTheDocument()
    expect(screen.getByText(/fails here: FAILED/)).toBeInTheDocument()
    expect(screen.getByText(/expected true/)).toBeInTheDocument()
    expect(screen.getByText(/2 examples, 1 failure/)).toBeInTheDocument()
  })

  it('renders pretty-printed JSON when it has no summary field', () => {
    const jsonWithoutSummary = JSON.stringify({ foo: 'bar' })
    render(<OutputPanel output={jsonWithoutSummary} />)
    expect(screen.getByText(/\"foo\"/)).toBeInTheDocument()
  })
})
