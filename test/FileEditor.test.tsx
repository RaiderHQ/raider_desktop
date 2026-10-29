import { render, screen, act, fireEvent } from '@testing-library/react'
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
    onChange
  }: {
    value: string
    onChange: (value: string) => void
  }): JSX.Element => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
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

const renderComponent = (extraState: object = {}): void => {
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/file-editor',
          state: { fileName: 'test.txt', filePath: '/fake/path', ...extraState }
        }
      ]}
    >
      <Routes>
        <Route path="/file-editor" element={<FileEditor />} />
        <Route path="/overview" element={<div>overview route</div>} />
        <Route path="/overview/tests/:testKey" element={<div>test route</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const back = (): HTMLElement => screen.getByText('test.txt').previousElementSibling as HTMLElement

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

  it('Back goes to the overview by default', async () => {
    await act(async () => {
      renderComponent()
    })
    fireEvent.click(back())
    expect(screen.getByText('overview route')).toBeInTheDocument()
  })

  it('Back returns to the page the file was opened from', async () => {
    await act(async () => {
      renderComponent({ returnTo: '/overview/tests/abc' })
    })
    fireEvent.click(back())
    expect(screen.getByText('test route')).toBeInTheDocument()
  })
})
