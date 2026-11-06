import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import FileEditor from '@pages/FileEditor'
import { dispatchMenuCommand } from '@foundation/menuCommands'
import '@testing-library/jest-dom'
import useTitleStore from '@foundation/Stores/titleStore'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

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

const back = (): HTMLElement => screen.getByRole('button', { name: 'editor.back' })

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
      renderComponent({ line: 7 })
    })
    expect(screen.getByTestId('editor')).toHaveAttribute('data-reveal-line', '7')
  })

  it('passes no revealLine when no line is requested', async () => {
    await act(async () => {
      renderComponent()
    })
    expect(screen.getByTestId('editor')).toHaveAttribute('data-reveal-line', '')
  })

  it('Back has a tooltip on focus', async () => {
    await act(async () => {
      renderComponent()
    })
    fireEvent.focus(back())
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.fileEditor.back')
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

  describe('saving (D3)', () => {
    beforeEach(() => mockApi.editFile.mockReset())

    const type = (text: string): void => {
      fireEvent.change(screen.getByTestId('editor'), { target: { value: text } })
    }
    const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'editor.saveButton' })

    it('has a Save button that wakes up once the file is edited', async () => {
      await act(async () => {
        renderComponent()
      })
      expect(saveButton()).toBeDisabled()
      expect(screen.getByText('editor.status.saved')).toBeInTheDocument()
      type('file content changed')
      expect(saveButton()).toBeEnabled()
      expect(screen.getByText('editor.status.unsaved')).toBeInTheDocument()
    })

    it('saves the edited content with the button and reports it as saved', async () => {
      mockApi.editFile.mockResolvedValue({ success: true })
      await act(async () => {
        renderComponent()
      })
      type('new content')
      await act(async () => {
        fireEvent.click(saveButton())
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/path', 'new content')
      await waitFor(() => expect(screen.getByText('editor.status.saved')).toBeInTheDocument())
      expect(saveButton()).toBeDisabled()
    })

    it('tells the window which file is open and whether it is dirty', async () => {
      mockApi.editFile.mockResolvedValue({ success: true })
      await act(async () => {
        renderComponent()
      })
      const name = useTitleStore.getState().document?.name
      expect(useTitleStore.getState().document).toEqual({ name, edited: false })
      type('edited')
      expect(useTitleStore.getState().document).toEqual({ name, edited: true })
      await act(async () => {
        fireEvent.click(saveButton())
      })
      await waitFor(() => expect(useTitleStore.getState().document?.edited).toBe(false))
    })

    it('keeps the edited state while the unsaved dialog is up', async () => {
      await act(async () => {
        renderComponent()
      })
      type('edited')
      fireEvent.click(back())
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(useTitleStore.getState().document?.edited).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.cancel' }))
      expect(useTitleStore.getState().document?.edited).toBe(true)
    })

    it('asks before leaving with unsaved changes, and Cancel stays', async () => {
      await act(async () => {
        renderComponent()
      })
      type('edited')
      fireEvent.click(back())
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('editor')).toBeInTheDocument()
    })

    it("Don't save leaves without writing", async () => {
      await act(async () => {
        renderComponent()
      })
      type('edited')
      fireEvent.click(back())
      fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.discard' }))
      expect(mockApi.editFile).not.toHaveBeenCalled()
      expect(screen.getByText('overview route')).toBeInTheDocument()
    })

    it('Save writes the file and then leaves', async () => {
      mockApi.editFile.mockResolvedValue({ success: true })
      await act(async () => {
        renderComponent({ returnTo: '/overview/tests/abc' })
      })
      type('edited')
      fireEvent.click(back())
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/path', 'edited')
      expect(await screen.findByText('test route')).toBeInTheDocument()
    })

    it('stays when the save before leaving fails', async () => {
      mockApi.editFile.mockResolvedValue({ success: false, error: 'read-only' })
      await act(async () => {
        renderComponent()
      })
      type('edited')
      fireEvent.click(back())
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
      })
      expect(screen.queryByText('overview route')).not.toBeInTheDocument()
      expect(screen.getByTestId('editor')).toBeInTheDocument()
    })

    it('leaves straight away when nothing changed', async () => {
      await act(async () => {
        renderComponent()
      })
      fireEvent.click(back())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('overview route')).toBeInTheDocument()
    })
  })

  describe('Cmd+S (D3 review)', () => {
    beforeEach(() => mockApi.editFile.mockReset())

    it('does nothing when there is nothing to save', async () => {
      await act(async () => {
        renderComponent()
      })
      fireEvent.keyDown(window, { key: 's', metaKey: true })
      expect(mockApi.editFile).not.toHaveBeenCalled()
    })

    it('does not start a second write while one is running', async () => {
      let finish: (v: { success: boolean }) => void = () => {}
      mockApi.editFile.mockReturnValue(new Promise((r) => (finish = r)))
      await act(async () => {
        renderComponent()
      })
      fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
      fireEvent.keyDown(window, { key: 's', metaKey: true })
      await act(async () => {})
      fireEvent.keyDown(window, { key: 's', metaKey: true })
      expect(mockApi.editFile).toHaveBeenCalledTimes(1)
      await act(async () => finish({ success: true }))
    })
  })

  describe('File › Save (D11)', () => {
    beforeEach(() => mockApi.editFile.mockReset())

    it('saves the file when the menu says so', async () => {
      mockApi.editFile.mockResolvedValue({ success: true })
      await act(async () => {
        renderComponent()
      })
      fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
      await act(async () => {
        dispatchMenuCommand('save')
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/path', 'edited')
    })

    it('writes nothing when nothing changed', async () => {
      await act(async () => {
        renderComponent()
      })
      await act(async () => {
        dispatchMenuCommand('save')
      })
      expect(mockApi.editFile).not.toHaveBeenCalled()
    })
  })
})
