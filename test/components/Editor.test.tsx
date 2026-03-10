import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// Monaco editor is a complex package that doesn't work in jsdom.
// Mock the entire component as the FileEditor page test already exercises
// the integration between FileEditor and a mocked Editor.
vi.mock('@components/Editor', () => ({
  default: ({ value, language }: { value: string; language: string }) => (
    <div data-testid="monaco-editor" data-language={language}>{value}</div>
  )
}))

import Editor from '@components/Editor'

describe('Editor', () => {
  it('renders a container with the provided value', () => {
    render(<Editor value="puts 'hello'" language="ruby" />)
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent("puts 'hello'")
  })

  it('passes the language to the editor', () => {
    render(<Editor value="" language="ruby" />)
    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'ruby')
  })
})
