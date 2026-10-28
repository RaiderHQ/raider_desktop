import { render, screen, act } from '@testing-library/react'
import FileEditor from '@pages/FileEditor'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

vi.mock('@components/Editor', () => ({
  default: ({
    value,
    onChange,
    revealLine
  }: {
    value: string
    onChange: (value: string) => void
    revealLine?: number
  }): JSX.Element => (
    <textarea
      data-testid="editor"
      data-reveal-line={revealLine === undefined ? '' : String(revealLine)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}))

const mockApi = {
  editFile: vi.fn(),
  readFile: vi.fn().mockResolvedValue({ success: true, data: 'file content' })
}

beforeEach((): void => {
  // @ts-ignore - Mocking the window.api object for testing purposes.
  window.api = mockApi
})

const renderComponent = (line?: number): void => {
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/file-editor', state: { fileName: 'test.txt', filePath: '/fake/path', line } }
      ]}
    >
      <Routes>
        <Route path="/file-editor" element={<FileEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('FileEditor Page', () => {
  it('renders loading state initially', async () => {
    mockApi.readFile.mockResolvedValueOnce(new Promise(() => {})) // Never resolves
    await act(async () => {
      renderComponent()
    })
    expect(screen.getByText('editor.loading')).toBeInTheDocument()
  })

  it('renders the file name and editor after loading', async () => {
    await act(async () => {
      renderComponent()
    })
    expect(screen.getByText('test.txt')).toBeInTheDocument()
    expect(screen.getByTestId('editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor')).toHaveValue('file content')
  })

  it('passes the requested line to the editor as revealLine', async () => {
    await act(async () => {
      renderComponent(7)
    })
    expect(screen.getByTestId('editor')).toHaveAttribute('data-reveal-line', '7')
  })

  it('passes no revealLine when no line is requested', async () => {
    await act(async () => {
      renderComponent()
    })
    expect(screen.getByTestId('editor')).toHaveAttribute('data-reveal-line', '')
  })
})
